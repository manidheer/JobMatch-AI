"""
Jobs API routes — search by title, scrape URL, manual paste.
"""
import logging
from fastapi import APIRouter, Depends, HTTPException, Request

from app.models import User
from app.schemas import JobListingResponse, JobSearchRequest, JobScrapeRequest, JobManualRequest, JobListingItem
from app.services.job_scraper import scrape_job_url
from app.services.job_search import search_jobs_by_title
from app.services.jd_extractor import extract_jd
from app.api.deps import get_current_user
from app.config import get_settings
from app.limiter import limiter

logger = logging.getLogger(__name__)
settings = get_settings()
router = APIRouter(prefix="/api/jobs", tags=["Jobs"])


@router.post("/search", response_model=JobListingResponse)
@limiter.limit("20/minute")
async def search_jobs(
    request: Request,
    payload: JobSearchRequest,
    current_user: User = Depends(get_current_user),
):
    if not payload.title.strip():
        raise HTTPException(status_code=400, detail="Job title cannot be empty.")
    jobs = await search_jobs_by_title(
        title=payload.title,
        location=payload.location,
        employment_type=payload.employment_type,
        num_results=min(payload.num_results, 10),
    )
    return JobListingResponse(jobs=[JobListingItem(**j) for j in jobs], source="api" if jobs else "none")


@router.post("/scrape", response_model=JobListingItem)
@limiter.limit("10/minute")
async def scrape_job(
    request: Request,
    payload: JobScrapeRequest,
    current_user: User = Depends(get_current_user),
):
    if not payload.url.startswith(("http://", "https://")):
        raise HTTPException(status_code=400, detail="Invalid URL.")
    result = await scrape_job_url(payload.url)
    if not result["success"]:
        raise HTTPException(status_code=422, detail="Could not extract job description. Please paste it manually.")
    return JobListingItem(
        job_title=result.get("job_title") or "Unknown Position",
        company=result.get("company"),
        job_url=payload.url,
        job_description=result["job_description"],
    )


@router.post("/manual", response_model=JobListingItem)
async def manual_job(
    payload: JobManualRequest,
    current_user: User = Depends(get_current_user),
):
    return JobListingItem(
        job_title=payload.job_title,
        company=payload.company,
        job_url=payload.job_url,
        job_description=payload.job_description,
    )


@router.post("/extract")
@limiter.limit("15/minute")
async def extract_job_details(
    request: Request,
    payload: JobManualRequest,
    current_user: User = Depends(get_current_user),
):
    """Extract structured data from a raw JD using AI."""
    try:
        structured = await extract_jd(payload.job_description)
    except Exception as e:
        logger.error("JD extraction failed: %s", e)
        raise HTTPException(status_code=500, detail="JD extraction failed.")
    return structured
