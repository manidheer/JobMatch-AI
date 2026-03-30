"""
Optimization API — generate optimized resume (DOCX + PDF) and cover letter.
"""
import json
import logging
import os
import asyncio
from time import perf_counter

from fastapi import APIRouter, Depends, HTTPException, Request, BackgroundTasks
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_db
from app.database import AsyncSessionLocal
from app.models import TrackedJob, Resume, OptimizedResume, CoverLetter, User
from app.schemas import (
    OptimizeResumeRequest, OptimizedResumeResponse,
    CoverLetterRequest, CoverLetterResponse,
)
from app.services.resume_optimizer import generate_structured_optimized_resume, generate_cover_letter
from app.services.pdf_generator import generate_template_documents
from app.api.deps import get_current_user, ensure_template_allowed
from app.config import get_settings
from app.limiter import limiter

logger = logging.getLogger(__name__)
settings = get_settings()
router = APIRouter(prefix="/api/optimize", tags=["Optimization"])


async def _generate_documents_async(
    optimized_resume_id,
    optimized_data: dict,
    upload_dir: str,
    template_type: str,
) -> None:
    start = perf_counter()
    try:
        doc_result = await asyncio.to_thread(
            generate_template_documents,
            resume_data=optimized_data,
            output_dir=upload_dir,
            template_type=template_type,
        )
        docx_path = doc_result.get("docx_path")
        pdf_path = doc_result.get("pdf_path")
    except Exception as e:
        logger.error("Async document generation failed for %s: %s", optimized_resume_id, e, exc_info=True)
        return

    async with AsyncSessionLocal() as session:
        result = await session.execute(
            select(OptimizedResume).where(OptimizedResume.id == optimized_resume_id)
        )
        opt = result.scalar_one_or_none()
        if not opt:
            return
        opt.docx_path = docx_path
        opt.pdf_path = pdf_path
        session.add(opt)
        await session.commit()

    logger.info(
        "Async document generation complete: id=%s latency=%.2fs",
        optimized_resume_id,
        perf_counter() - start,
    )


async def _owned_job(job_id, user_id, db) -> TrackedJob:
    result = await db.execute(
        select(TrackedJob).where(TrackedJob.id == job_id, TrackedJob.user_id == user_id)
    )
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Tracked job not found.")
    return job


async def _owned_resume(resume_id, user_id, db) -> Resume:
    result = await db.execute(
        select(Resume).where(Resume.id == resume_id, Resume.user_id == user_id)
    )
    resume = result.scalar_one_or_none()
    if not resume:
        raise HTTPException(status_code=404, detail="Resume not found.")
    return resume


async def _owned_opt(opt_id, user_id, db) -> OptimizedResume:
    """Fetch an OptimizedResume that belongs to the user (via tracked_job ownership)."""
    result = await db.execute(
        select(OptimizedResume)
        .join(TrackedJob, OptimizedResume.tracked_job_id == TrackedJob.id)
        .where(OptimizedResume.id == opt_id, TrackedJob.user_id == user_id)
    )
    opt = result.scalar_one_or_none()
    if not opt:
        raise HTTPException(status_code=404, detail="Optimized resume not found.")
    return opt


@router.post("/resume", response_model=OptimizedResumeResponse)
@limiter.limit(settings.RATE_LIMIT_OPTIMIZE)
async def optimize_resume(
    request: Request,
    background_tasks: BackgroundTasks,
    payload: OptimizeResumeRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    total_start = perf_counter()
    template_type = ensure_template_allowed(current_user, payload.template_type)
    tracked_job = await _owned_job(payload.tracked_job_id, current_user.id, db)
    resume = await _owned_resume(payload.resume_id, current_user.id, db)

    resume_data = {
        "summary": resume.summary,
        "skills": resume.skills,
        "experience": resume.experience,
        "education": resume.education,
        "projects": resume.projects,
    }

    upload_dir = os.path.join(settings.UPLOAD_DIR, "optimized")
    try:
        llm_start = perf_counter()
        optimized_data = await generate_structured_optimized_resume(
            resume_data=resume_data,
            job_description=tracked_job.job_description,
            missing_skills=tracked_job.missing_skills or [],
            recommended_skills=tracked_job.recommended_skills or [],
            template_type=template_type,
        )
        logger.info("[optimize-api] structured optimization latency=%.2fs", perf_counter() - llm_start)
        optimized_text = json.dumps(optimized_data, indent=2)
    except Exception as e:
        logger.error("Optimization pipeline failed: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail="Resume optimization failed.")

    opt = OptimizedResume(
        tracked_job_id=tracked_job.id,
        resume_id=resume.id,
        optimized_text=optimized_text,
        original_resume_text=json.dumps(resume_data),
        pdf_path=None,
        docx_path=None,
    )
    db.add(opt)
    await db.flush()
    await db.refresh(opt)

    background_tasks.add_task(
        _generate_documents_async,
        opt.id,
        optimized_data,
        upload_dir,
        template_type,
    )
    logger.info("Optimization queued: id=%s total_latency=%.2fs", opt.id, perf_counter() - total_start)
    return opt


class UpdateOptimizedResumeRequest(BaseModel):
    optimized_text: str
    template_type: str = "modern"


@router.put("/resume/{optimized_resume_id}", response_model=OptimizedResumeResponse)
async def update_optimized_resume(
    optimized_resume_id: str,
    background_tasks: BackgroundTasks,
    payload: UpdateOptimizedResumeRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    start = perf_counter()
    template_type = ensure_template_allowed(current_user, payload.template_type)
    opt = await _owned_opt(optimized_resume_id, current_user.id, db)

    try:
        optimized_data = json.loads(payload.optimized_text)
    except Exception:
        raise HTTPException(status_code=422, detail="Invalid JSON provided.")

    upload_dir = os.path.join(settings.UPLOAD_DIR, "optimized")
    opt.optimized_text = payload.optimized_text
    opt.pdf_path = None
    opt.docx_path = None
    db.add(opt)
    await db.commit()
    await db.refresh(opt)

    background_tasks.add_task(
        _generate_documents_async,
        opt.id,
        optimized_data,
        upload_dir,
        template_type,
    )
    logger.info("Optimization regeneration queued: id=%s latency=%.2fs", opt.id, perf_counter() - start)
    return opt


@router.get("/resume/{optimized_resume_id}", response_model=OptimizedResumeResponse)
async def get_optimized_resume_status(
    optimized_resume_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Fetch an optimized resume record to poll DOCX/PDF readiness."""
    return await _owned_opt(optimized_resume_id, current_user.id, db)


@router.get("/for-job/{tracked_job_id}", response_model=OptimizedResumeResponse)
async def get_latest_optimized_for_job(
    tracked_job_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return the most recently created OptimizedResume for a tracked job."""
    await _owned_job(tracked_job_id, current_user.id, db)
    result = await db.execute(
        select(OptimizedResume)
        .where(OptimizedResume.tracked_job_id == tracked_job_id)
        .order_by(OptimizedResume.created_at.desc())
        .limit(1)
    )
    opt = result.scalar_one_or_none()
    if not opt:
        raise HTTPException(status_code=404, detail="No optimized resume found for this job.")
    return opt


@router.get("/{optimized_resume_id}/pdf")
async def download_pdf(
    optimized_resume_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    opt = await _owned_opt(optimized_resume_id, current_user.id, db)
    if not opt.pdf_path or not os.path.exists(opt.pdf_path):
        raise HTTPException(status_code=404, detail="PDF not found. Please regenerate.")
    return FileResponse(
        path=opt.pdf_path,
        media_type="application/pdf",
        filename="optimized_resume.pdf",
        headers={"Content-Disposition": "attachment; filename=optimized_resume.pdf"},
    )


@router.get("/{optimized_resume_id}/docx")
async def download_docx(
    optimized_resume_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    opt = await _owned_opt(optimized_resume_id, current_user.id, db)
    if not opt.docx_path or not os.path.exists(opt.docx_path):
        raise HTTPException(status_code=404, detail="DOCX not found. Please regenerate.")
    return FileResponse(
        path=opt.docx_path,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        filename="optimized_resume.docx",
        headers={"Content-Disposition": "attachment; filename=optimized_resume.docx"},
    )


@router.post("/cover-letter", response_model=CoverLetterResponse)
async def create_cover_letter(
    payload: CoverLetterRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    tracked_job = await _owned_job(payload.tracked_job_id, current_user.id, db)
    resume = await _owned_resume(payload.resume_id, current_user.id, db)

    resume_dict = {"skills": resume.skills, "summary": resume.summary, "experience": resume.experience}
    try:
        content = await generate_cover_letter(
            resume=resume_dict,
            job_title=tracked_job.job_title,
            company=tracked_job.company or "the company",
            job_description=tracked_job.job_description,
            matched_skills=tracked_job.matched_skills or [],
        )
    except Exception as e:
        logger.error("Cover letter generation failed: %s", e)
        raise HTTPException(status_code=500, detail="Cover letter generation failed.")

    cl = CoverLetter(tracked_job_id=tracked_job.id, content=content)
    db.add(cl)
    await db.flush()
    await db.refresh(cl)
    return cl
