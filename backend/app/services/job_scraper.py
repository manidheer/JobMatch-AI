"""
Job scraper service — fetches a job posting URL and extracts
the job description text using httpx + BeautifulSoup.
"""
import json
import logging
import re
from time import perf_counter
from html import unescape
from urllib.parse import urlparse

import httpx
from bs4 import BeautifulSoup

logger = logging.getLogger(__name__)

# Common CSS selectors for job description containers across popular job sites
JOB_DESCRIPTION_SELECTORS = [
    # LinkedIn
    "div.show-more-less-html__markup",
    "div.description__text",
    # Indeed
    "div#jobDescriptionText",
    "div.jobsearch-jobDescriptionText",
    # Greenhouse ATS
    "div#content",
    "div.content",
    # Lever ATS
    "div.section-wrapper",
    # Workday
    "div[data-automation-id='jobPostingDescription']",
    # Generic fallbacks
    "article",
    "main",
    "div.job-description",
    "div.job_description",
    "div[class*='description']",
    "div[id*='description']",
]

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept-Language": "en-US,en;q=0.9",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
}

_BLOCKED_MARKERS = [
    "access denied",
    "are you a human",
    "verify you are human",
    "captcha",
    "cloudflare",
    "please enable javascript",
    "request blocked",
    "bot detection",
]

_LINKEDIN_AUTHWALL_MARKERS = [
    "sign up | linkedin",
    "join linkedin",
    "agree & join",
    "already on linkedin? sign in",
    "security verification",
    "linkedin©",
]

_READER_META_PREFIXES = (
    "title:",
    "url source:",
    "published time:",
    "author:",
    "description:",
    "markdown content:",
)


def _strip_html(raw: str) -> str:
    """Convert small HTML snippets to readable plain text."""
    if not raw:
        return ""
    text = BeautifulSoup(unescape(raw), "lxml").get_text(separator="\n")
    return _clean_text(text)


def _extract_from_json_ld(soup: BeautifulSoup) -> str | None:
    """Extract JobPosting.description from JSON-LD when available."""
    scripts = soup.find_all("script", attrs={"type": "application/ld+json"})
    if not scripts:
        return None

    def _iter_items(obj):
        if isinstance(obj, list):
            for item in obj:
                yield from _iter_items(item)
        elif isinstance(obj, dict):
            if "@graph" in obj:
                yield from _iter_items(obj.get("@graph"))
            else:
                yield obj

    for script in scripts:
        payload = (script.string or script.get_text() or "").strip()
        if not payload:
            continue
        try:
            data = json.loads(payload)
        except Exception:
            continue

        for item in _iter_items(data):
            obj_type = item.get("@type")
            if isinstance(obj_type, list):
                is_job = any(str(t).lower() == "jobposting" for t in obj_type)
            else:
                is_job = str(obj_type).lower() == "jobposting"
            if not is_job:
                continue

            desc = _strip_html(str(item.get("description") or ""))
            if len(desc) > 120:
                return desc

    return None


def _looks_blocked(html: str) -> bool:
    sample = (html or "").lower()
    return any(marker in sample for marker in _BLOCKED_MARKERS)


def _looks_linkedin_authwall(text: str) -> bool:
    sample = (text or "").lower()
    return any(marker in sample for marker in _LINKEDIN_AUTHWALL_MARKERS)


def _clean_text(text: str) -> str:
    """Remove excess whitespace and normalize newlines."""
    text = re.sub(r"\n{3,}", "\n\n", text)
    text = re.sub(r"[ \t]+", " ", text)
    return text.strip()


def _extract_from_reader_text(text: str) -> str | None:
    """Parse plain-text payloads from reader fallback (e.g., r.jina.ai)."""
    if not text:
        return None

    if _looks_linkedin_authwall(text):
        return None

    lines = []
    for raw in text.splitlines():
        line = raw.strip()
        if not line:
            continue
        lower = line.lower()
        if lower.startswith(_READER_META_PREFIXES):
            continue
        if line.startswith("```"):
            continue
        lines.append(line)

    cleaned = _clean_text("\n".join(lines))
    return cleaned if len(cleaned) > 200 else None


def _extract_reader_title(text: str) -> str | None:
    """Extract title line from reader fallback payload."""
    if not text:
        return None
    for raw in text.splitlines()[:20]:
        line = raw.strip()
        if line.lower().startswith("title:"):
            title = line.split(":", 1)[1].strip()
            return title[:200] if title else None
    return None


def _extract_from_html(html: str, url: str) -> str | None:
    """
    Try well-known selectors first, then fall back to reading
    the largest block of text on the page.
    """
    # Reader fallback may return plain text/markdown instead of HTML.
    if not re.search(r"<\s*[a-zA-Z][^>]*>", html):
        return _extract_from_reader_text(html)

    if "linkedin.com" in (urlparse(url).netloc or "") and _looks_linkedin_authwall(html):
        return None

    soup = BeautifulSoup(html, "lxml")

    # Many job boards expose content as JSON-LD JobPosting.description.
    jd_from_json_ld = _extract_from_json_ld(soup)
    if jd_from_json_ld:
        return jd_from_json_ld

    # Remove nav, footer, header, script, style noise
    for tag in soup(["script", "style", "nav", "footer", "header", "aside"]):
        tag.decompose()

    # Try each known selector
    for selector in JOB_DESCRIPTION_SELECTORS:
        element = soup.select_one(selector)
        if element:
            text = element.get_text(separator="\n")
            cleaned = _clean_text(text)
            if len(cleaned) > 200:  # Sanity check — at least some content
                return cleaned

    # Fallback: find the div with the most text
    divs = soup.find_all("div")
    if divs:
        longest = max(divs, key=lambda d: len(d.get_text()), default=None)
        if longest:
            text = longest.get_text(separator="\n")
            return _clean_text(text)

    return None


def _extract_linkedin_job_id(url: str) -> str | None:
    """Extract numeric job id from linkedin job URL."""
    m = re.search(r"/jobs/view/(\d+)", url)
    return m.group(1) if m else None


async def _scrape_linkedin_guest_job(client: httpx.AsyncClient, url: str) -> dict | None:
    """Use LinkedIn guest endpoint to fetch actual job details without authwall noise."""
    job_id = _extract_linkedin_job_id(url)
    if not job_id:
        return None

    guest_url = f"https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/{job_id}"
    try:
        resp = await client.get(guest_url)
        resp.raise_for_status()
    except Exception as e:
        logger.warning("LinkedIn guest endpoint failed for %s: %s", url, e)
        return None

    html = resp.text or ""
    if not html or _looks_linkedin_authwall(html):
        return None

    soup = BeautifulSoup(html, "lxml")
    desc_el = soup.select_one("div.show-more-less-html__markup") or soup.select_one("div.description__text")
    description = _clean_text(desc_el.get_text(separator="\n")) if desc_el else ""
    if len(description) < 100:
        description = _extract_from_html(html, url) or ""
    if len(description) < 100:
        return None

    title_el = (
        soup.select_one("h2.top-card-layout__title")
        or soup.select_one("h1.top-card-layout__title")
        or soup.select_one("title")
    )
    company_el = (
        soup.select_one("a.topcard__org-name-link")
        or soup.select_one("span.topcard__flavor")
        or soup.select_one("div.topcard__flavor-row span")
    )

    return {
        "job_title": _clean_text(title_el.get_text())[:200] if title_el else None,
        "company": _clean_text(company_el.get_text())[:120] if company_el else None,
        "job_description": description[:8000],
    }


async def scrape_job_url(url: str) -> dict:
    """
    Fetch a job posting and return:
    {
        "job_description": str,
        "job_title": str | None,
        "company": str | None,
        "success": bool
    }
    """
    result = {
        "job_description": "",
        "job_title": None,
        "company": None,
        "success": False,
    }
    total_start = perf_counter()

    try:
        async with httpx.AsyncClient(
            headers=HEADERS, follow_redirects=True, timeout=20.0
        ) as client:
            # LinkedIn dedicated path first to avoid authwall pages.
            if "linkedin.com" in (urlparse(url).netloc or ""):
                li_start = perf_counter()
                li_result = await _scrape_linkedin_guest_job(client, url)
                if li_result:
                    result["job_title"] = li_result.get("job_title")
                    result["company"] = li_result.get("company") or "LinkedIn"
                    result["job_description"] = li_result["job_description"]
                    result["success"] = True
                    logger.info("LinkedIn guest scrape latency=%.2fs", perf_counter() - li_start)
                    logger.info("scrape_job_url total latency=%.2fs", perf_counter() - total_start)
                    return result

            html = ""
            blocked_like_response = False
            response_status = None

            try:
                fetch_start = perf_counter()
                response = await client.get(url)
                response_status = response.status_code
                response.raise_for_status()
                html = response.text
                blocked_like_response = _looks_blocked(html)
                logger.info("Primary fetch latency=%.2fs status=%s", perf_counter() - fetch_start, response_status)
            except httpx.HTTPStatusError as e:
                response_status = e.response.status_code
                logger.warning("Primary fetch failed for %s with status %s", url, response_status)

            used_reader_fallback = False
            if not html or blocked_like_response or response_status in {401, 403, 406, 409, 429}:
                # Fallback reader often bypasses anti-bot pages and JS-heavy portals.
                try:
                    reader_start = perf_counter()
                    reader_url = f"https://r.jina.ai/http://{url.lstrip('/').removeprefix('http://').removeprefix('https://')}"
                    reader_resp = await client.get(reader_url)
                    reader_resp.raise_for_status()
                    html = reader_resp.text
                    used_reader_fallback = True
                    logger.info("Reader fallback latency=%.2fs", perf_counter() - reader_start)
                except Exception as reader_err:
                    logger.warning("Reader fallback failed for %s: %s", url, reader_err)

        if not html:
            return result

        if used_reader_fallback and not result["job_title"]:
            result["job_title"] = _extract_reader_title(html)

        soup = BeautifulSoup(html, "lxml")

        # Try to extract title from <title> or <h1>
        title_tag = soup.find("title")
        if title_tag:
            result["job_title"] = title_tag.get_text().strip()[:200]

        h1 = soup.find("h1")
        if h1:
            result["job_title"] = h1.get_text().strip()[:200]

        # Try to extract company name
        domain = urlparse(url).netloc.replace("www.", "")
        result["company"] = domain.split(".")[0].title()

        og_site = soup.find("meta", property="og:site_name")
        if og_site and og_site.get("content"):
            result["company"] = og_site["content"]

        description = _extract_from_html(html, url)
        if description and len(description) > 100:
            result["job_description"] = description[:8000]  # Cap at 8k chars
            result["success"] = True
            if used_reader_fallback:
                logger.info("Extracted job description via reader fallback for %s", url)
        else:
            logger.warning(f"Could not extract meaningful job description from {url}")
    except httpx.RequestError as e:
        logger.error(f"Request error scraping {url}: {e}")
    except Exception as e:
        logger.error(f"Unexpected error scraping {url}: {e}")

    logger.info("scrape_job_url total latency=%.2fs success=%s", perf_counter() - total_start, result["success"])

    return result
