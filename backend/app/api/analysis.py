"""
Analysis API routes — run AI match analysis, retrieve tracked jobs.
"""
import logging
from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, desc

from app.database import get_db
from app.models import Resume, TrackedJob, User
from app.schemas import (
    AnalyzeRequest, AnalysisResult, DashboardStats, ManualTrackRequest,
    TrackedJobUpdate, AnalysisReport, SaveAnalysisRequest,
)
from app.services.ai_analyzer import analyze_match
from app.api.deps import get_current_user
from app.config import get_settings
from app.limiter import limiter

logger = logging.getLogger(__name__)
settings = get_settings()
router = APIRouter(prefix="/api/analysis", tags=["Analysis"])


async def _check_and_increment_ai_calls(user: User, db: AsyncSession) -> None:
    """Enforce DAILY_AI_LIMIT. Raises 429 if exceeded, otherwise increments counter."""
    today = date.today()
    if user.ai_calls_reset_date != today:
        user.ai_calls_today = 0
        user.ai_calls_reset_date = today
    if user.ai_calls_today >= settings.DAILY_AI_LIMIT:
        raise HTTPException(
            status_code=429,
            detail=f"Daily AI limit of {settings.DAILY_AI_LIMIT} calls reached. Resets at midnight.",
        )
    user.ai_calls_today += 1
    db.add(user)


@router.post("/analyze")
@limiter.limit(settings.RATE_LIMIT_ANALYZE)
async def analyze_job(
    request: Request,
    payload: AnalyzeRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Resume).where(Resume.id == payload.resume_id, Resume.user_id == current_user.id)
    )
    resume = result.scalar_one_or_none()
    if not resume:
        raise HTTPException(status_code=404, detail="Resume not found.")

    await _check_and_increment_ai_calls(current_user, db)

    resume_dict = {
        "raw_text": resume.raw_text,
        "skills": resume.skills,
        "experience": resume.experience,
        "education": resume.education,
        "projects": resume.projects,
        "summary": resume.summary,
    }

    try:
        analysis = await analyze_match(
            resume_dict, payload.job_description,
            mode=payload.mode, pre_extracted_jd=payload.jd_structured,
        )
    except Exception as e:
        logger.error("Analysis pipeline failed: %s", e)
        raise HTTPException(status_code=500, detail="Match analysis failed.")

    report = {
        "job_title": payload.job_title,
        "company": payload.company,
        "job_url": payload.job_url,
        "job_description": payload.job_description,
        "match_score": analysis.get("match_score", 0),
        "matched_skills": analysis.get("matched_skills", []),
        "missing_skills": analysis.get("missing_skills", []),
        "recommended_skills": analysis.get("recommended_skills", []),
        "experience_gaps": analysis.get("experience_gaps", []),
        "learning_resources": analysis.get("learning_resources", {}),
        "jd_structured": analysis.get("jd_structured"),
        "reasoning": analysis.get("holistic_reasoning") or analysis.get("reasoning"),
        "priority_group": analysis.get("priority_group", "normal"),
        "strengths": analysis.get("strengths", []),
        "quick_wins": analysis.get("quick_wins", []),
        "eligibility_flags": analysis.get("eligibility_flags", []),
        "match_label": analysis.get("match_label"),
        "semantic_boost": analysis.get("semantic_boost"),
        "python_match_stats": analysis.get("python_match_stats"),
    }

    if not payload.persist:
        return report

    tracked = TrackedJob(
        user_id=current_user.id,
        resume_id=resume.id,
        status="analyzed",
        **report,
    )
    db.add(tracked)
    await db.flush()
    await db.refresh(tracked)
    return tracked


@router.post("/track-any", response_model=AnalysisResult)
async def track_any_job(
    request_data: SaveAnalysisRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Persist an existing analysis into the tracking database."""
    # Verify resume ownership
    result = await db.execute(
        select(Resume).where(Resume.id == request_data.resume_id, Resume.user_id == current_user.id)
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Resume not found.")

    tracked = TrackedJob(
        user_id=current_user.id,
        resume_id=request_data.resume_id,
        job_title=request_data.analysis.job_title,
        company=request_data.analysis.company,
        job_url=request_data.analysis.job_url,
        job_description=request_data.analysis.job_description,
        match_score=request_data.analysis.match_score,
        matched_skills=request_data.analysis.matched_skills,
        missing_skills=request_data.analysis.missing_skills,
        recommended_skills=request_data.analysis.recommended_skills,
        experience_gaps=request_data.analysis.experience_gaps,
        learning_resources=request_data.analysis.learning_resources,
        jd_structured=request_data.analysis.jd_structured,
        reasoning=request_data.analysis.reasoning,
        status=request_data.status,
        priority_group=request_data.analysis.priority_group,
        strengths=request_data.analysis.strengths,
        quick_wins=request_data.analysis.quick_wins,
        eligibility_flags=request_data.analysis.eligibility_flags,
        match_label=request_data.analysis.match_label,
        python_match_stats=request_data.analysis.python_match_stats,
        semantic_boost=request_data.analysis.semantic_boost,
    )
    db.add(tracked)
    await db.commit()
    await db.refresh(tracked)
    return tracked


@router.post("/track-manual", response_model=AnalysisResult, status_code=status.HTTP_201_CREATED)
async def track_manual_job(
    request_data: ManualTrackRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Resume).where(Resume.id == request_data.resume_id, Resume.user_id == current_user.id)
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Resume not found.")

    tracked = TrackedJob(
        user_id=current_user.id,
        resume_id=request_data.resume_id,
        job_title=request_data.job_title,
        company=request_data.company,
        job_url=request_data.job_url,
        job_description="Manually added via tracker (no analysis run).",
        match_score=0,
        status=request_data.status,
        priority_group=request_data.priority_group,
        notes=request_data.notes,
    )
    db.add(tracked)
    await db.flush()
    await db.refresh(tracked)
    return tracked


@router.get("/tracked", response_model=list[AnalysisResult])
async def get_tracked_jobs(
    resume_id: str | None = None,
    limit: int = 50,
    offset: int = 0,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    query = (
        select(TrackedJob)
        .where(TrackedJob.user_id == current_user.id)
        .order_by(desc(TrackedJob.created_at))
        .limit(min(limit, 200))
        .offset(offset)
    )
    if resume_id:
        query = query.where(TrackedJob.resume_id == resume_id)
    result = await db.execute(query)
    return result.scalars().all()


@router.get("/stats", response_model=DashboardStats)
async def get_dashboard_stats(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    total_result = await db.execute(
        select(func.count(TrackedJob.id)).where(TrackedJob.user_id == current_user.id)
    )
    total = total_result.scalar_one() or 0

    if total == 0:
        return DashboardStats(total_jobs_analyzed=0, average_match_score=0.0, top_missing_skills=[], jobs_applied=0)

    avg_result = await db.execute(
        select(func.avg(TrackedJob.match_score))
        .where(TrackedJob.user_id == current_user.id, TrackedJob.match_score.isnot(None))
    )
    avg_score = avg_result.scalar_one() or 0.0

    applied_result = await db.execute(
        select(func.count(TrackedJob.id))
        .where(TrackedJob.user_id == current_user.id, TrackedJob.status == "applied")
    )
    applied = applied_result.scalar_one() or 0

    skills_result = await db.execute(
        select(TrackedJob.missing_skills)
        .where(TrackedJob.user_id == current_user.id, TrackedJob.missing_skills.isnot(None))
    )
    skill_counts: dict[str, int] = {}
    for row in skills_result.scalars().all():
        for skill in (row or []):
            skill_counts[skill] = skill_counts.get(skill, 0) + 1

    top_missing = sorted(skill_counts, key=lambda s: -skill_counts[s])[:8]

    return DashboardStats(
        total_jobs_analyzed=total,
        average_match_score=round(float(avg_score), 1),
        top_missing_skills=top_missing,
        jobs_applied=applied,
    )


@router.get("/{job_id}", response_model=AnalysisResult)
async def get_analysis(
    job_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(TrackedJob).where(TrackedJob.id == job_id, TrackedJob.user_id == current_user.id)
    )
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Tracked job not found.")
    return job


@router.patch("/{job_id}", response_model=AnalysisResult)
async def update_tracked_job(
    job_id: str,
    update_data: TrackedJobUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(TrackedJob).where(TrackedJob.id == job_id, TrackedJob.user_id == current_user.id)
    )
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found.")

    if update_data.status is not None:
        valid_statuses = ["analyzed", "applied", "interviewing", "rejected", "offer"]
        if update_data.status not in valid_statuses:
            raise HTTPException(status_code=400, detail=f"Invalid status. Choose from: {valid_statuses}")
        job.status = update_data.status

    if update_data.priority_group is not None:
        valid_priorities = ["action_needed", "worth", "not_worth", "normal"]
        if update_data.priority_group not in valid_priorities:
            raise HTTPException(status_code=400, detail=f"Invalid priority. Choose from: {valid_priorities}")
        job.priority_group = update_data.priority_group

    if update_data.notes is not None:
        job.notes = update_data.notes
    if update_data.job_title is not None:
        job.job_title = update_data.job_title
    if update_data.company is not None:
        job.company = update_data.company
    if update_data.job_url is not None:
        job.job_url = update_data.job_url
    if update_data.jd_structured is not None:
        job.jd_structured = update_data.jd_structured

    await db.commit()
    await db.refresh(job)
    return job


@router.delete("/clear-analyzed", status_code=status.HTTP_200_OK)
async def clear_analyzed_jobs(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from sqlalchemy import delete
    stmt = delete(TrackedJob).where(
        TrackedJob.user_id == current_user.id,
        TrackedJob.status == "analyzed",
    )
    await db.execute(stmt)
    await db.commit()
    return {"message": "All analyzed jobs cleared."}


@router.delete("/{job_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_tracked_job(
    job_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(TrackedJob).where(TrackedJob.id == job_id, TrackedJob.user_id == current_user.id)
    )
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found.")
    await db.delete(job)
    await db.commit()
