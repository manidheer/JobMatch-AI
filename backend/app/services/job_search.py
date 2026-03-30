"""
Job search service — returns real job listings for a given title.

Primary: RapidAPI JSearch (free tier available)
Fallback: Curated mock that looks realistic for UI demonstration.
"""
import logging
from datetime import datetime, timedelta
import random
import httpx
from app.config import get_settings

logger = logging.getLogger(__name__)
settings = get_settings()

JSEARCH_BASE = "https://jsearch.p.rapidapi.com/search"


async def search_jobs_by_title(
    title: str, location: str = "United States", employment_type: str = "FULLTIME", num_results: int = 8
) -> list[dict]:
    """
    Search for live job postings using RapidAPI JSearch.
    """
    if not settings.RAPIDAPI_KEY:
        logger.error("RAPIDAPI_KEY is not configured in .env")
        raise ValueError("RAPIDAPI_KEY is missing. Add it to .env to enable real job search.")

    return await _search_via_rapidapi(title, location, employment_type, num_results)


async def _search_via_rapidapi(title: str, location: str, employment_type: str, num_results: int) -> list[dict]:
    headers = {
        "X-RapidAPI-Key": settings.RAPIDAPI_KEY,
        "X-RapidAPI-Host": "jsearch.p.rapidapi.com",
    }
    params = {
        "query": f"{title} in {location}",
        "page": "1",
        "num_pages": "1",
        "employment_types": employment_type,
    }

    async with httpx.AsyncClient(timeout=15.0) as client:
        response = await client.get(JSEARCH_BASE, headers=headers, params=params)
        response.raise_for_status()
        data = response.json()

    jobs = []
    items = data.get("data") or []
    for item in items[:num_results]:
        jobs.append({
            "job_title": item.get("job_title") or title,
            "company": item.get("employer_name") or "Unknown",
            "location": item.get("job_city") or location,
            "job_url": item.get("job_apply_link") or item.get("job_google_link"),
            "job_description": (item.get("job_description") or "")[:6000],
            "salary": _format_salary(item),
            "posted_date": _format_date(item.get("job_posted_at_datetime_utc")),
            "employment_type": item.get("job_employment_type") or "Full-time",
        })
    return jobs


def _format_salary(item: dict) -> str | None:
    min_s = item.get("job_min_salary")
    max_s = item.get("job_max_salary")
    period = item.get("job_salary_period", "YEAR")
    if min_s and max_s:
        if period == "YEAR":
            return f"${int(min_s):,} – ${int(max_s):,}/yr"
        return f"${min_s} – ${max_s}"
    return None


def _format_date(date_str: str | None) -> str | None:
    if not date_str:
        return None
    try:
        dt = datetime.fromisoformat(date_str.replace("Z", "+00:00"))
        diff = datetime.now(dt.tzinfo) - dt
        if diff.days == 0:
            return "Today"
        if diff.days == 1:
            return "Yesterday"
        if diff.days < 7:
            return f"{diff.days} days ago"
        return dt.strftime("%b %d, %Y")
    except Exception:
        return date_str



