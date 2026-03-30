"""
Resume API routes — upload, parse, retrieve, delete.
"""
import logging
import os
import re
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
from pydantic import BaseModel

from app.database import get_db
from app.models import Resume, User
from app.schemas import ResumeResponse, ResumeUpdate
from app.services.resume_parser import extract_text, parse_resume_with_llm
from app.services.embeddings import get_embedding
from app.api.deps import get_current_user
from app.config import get_settings
from app.limiter import limiter

logger = logging.getLogger(__name__)
settings = get_settings()
router = APIRouter(prefix="/api/resume", tags=["Resume"])

ALLOWED_TYPES = {
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/msword",
    "application/pdf",
}

_SAFE_FILENAME_RE = re.compile(r"[^\w.\-]")


def _safe_filename(name: str) -> str:
    name = os.path.basename(name)
    name = _SAFE_FILENAME_RE.sub("_", name)
    return name or "resume"


class ResumeTextUpload(BaseModel):
    text: str


@router.post("/upload", response_model=ResumeResponse, status_code=status.HTTP_201_CREATED)
@limiter.limit(settings.RATE_LIMIT_UPLOAD)
async def upload_resume(
    request: Request,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if file.content_type not in ALLOWED_TYPES:
        raise HTTPException(status_code=400, detail=f"Unsupported file type: {file.content_type}. Please upload a PDF or DOCX.")

    content = await file.read()
    size_mb = len(content) / (1024 * 1024)
    if size_mb > settings.MAX_FILE_SIZE_MB:
        raise HTTPException(status_code=400, detail=f"File too large ({size_mb:.1f} MB). Max is {settings.MAX_FILE_SIZE_MB} MB.")

    ext = Path(file.filename).suffix.lower()
    file_type = ext.lstrip(".") if ext else "docx"

    originals_dir = os.path.join(settings.UPLOAD_DIR, "originals")
    os.makedirs(originals_dir, exist_ok=True)
    safe_name = _safe_filename(file.filename or "resume")
    original_filename = f"{uuid.uuid4().hex}_{safe_name}"
    original_file_path = os.path.join(originals_dir, original_filename)
    with open(original_file_path, "wb") as f:
        f.write(content)

    try:
        raw_text = extract_text(content, file.filename)
    except Exception as e:
        logger.error("Text extraction failed: %s", e)
        raise HTTPException(status_code=422, detail=f"Could not extract text from file: {e}")

    if len(raw_text.strip()) < 50:
        raise HTTPException(status_code=422, detail="Extracted text is too short. Please ensure the PDF is not image-only (scanned).")

    try:
        parsed = await parse_resume_with_llm(raw_text)
    except Exception as e:
        logger.error("LLM parsing failed: %s", e)
        raise HTTPException(status_code=500, detail="AI parsing failed. Please try again.")

    try:
        embedding = await get_embedding(raw_text[:15000])
    except Exception as e:
        logger.warning("Embedding generation failed: %s", e)
        embedding = None

    resume = Resume(
        user_id=current_user.id,
        filename=file.filename,
        raw_text=raw_text,
        skills=parsed.get("skills", []),
        experience=parsed.get("experience", []),
        education=parsed.get("education", []),
        projects=parsed.get("projects", []),
        summary=parsed.get("summary"),
        embedding=embedding,
        original_file_path=original_file_path,
        file_type=file_type,
    )
    db.add(resume)
    await db.flush()
    await db.refresh(resume)
    logger.info("Resume uploaded: %s by user %s", resume.id, current_user.id)
    return resume


@router.post("/text", response_model=ResumeResponse, status_code=status.HTTP_201_CREATED)
@limiter.limit(settings.RATE_LIMIT_UPLOAD)
async def upload_resume_text(
    request: Request,
    payload: ResumeTextUpload,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    raw_text = payload.text
    if len(raw_text.strip()) < 50:
        raise HTTPException(status_code=422, detail="Text is too short. Please provide more content.")

    try:
        parsed = await parse_resume_with_llm(raw_text)
    except Exception as e:
        logger.error("LLM parsing failed: %s", e)
        raise HTTPException(status_code=500, detail="AI parsing failed. Please try again.")

    try:
        embedding = await get_embedding(raw_text[:15000])
    except Exception as e:
        logger.warning("Embedding generation failed: %s", e)
        embedding = None

    resume = Resume(
        user_id=current_user.id,
        filename="pasted_text_resume.txt",
        raw_text=raw_text,
        skills=parsed.get("skills", []),
        experience=parsed.get("experience", []),
        education=parsed.get("education", []),
        projects=parsed.get("projects", []),
        summary=parsed.get("summary"),
        embedding=embedding,
        original_file_path=None,
        file_type="txt",
    )
    db.add(resume)
    await db.flush()
    await db.refresh(resume)
    return resume


@router.get("/current", response_model=ResumeResponse)
async def get_current_resume(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Return the most recently uploaded resume for the authenticated user."""
    result = await db.execute(
        select(Resume)
        .where(Resume.user_id == current_user.id)
        .order_by(desc(Resume.created_at))
        .limit(1)
    )
    resume = result.scalar_one_or_none()
    if not resume:
        raise HTTPException(status_code=404, detail="No resume found. Please upload your resume first.")
    return resume


@router.get("/{resume_id}", response_model=ResumeResponse)
async def get_resume(
    resume_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Resume).where(Resume.id == resume_id, Resume.user_id == current_user.id)
    )
    resume = result.scalar_one_or_none()
    if not resume:
        raise HTTPException(status_code=404, detail="Resume not found.")
    return resume


@router.put("/{resume_id}", response_model=ResumeResponse)
async def update_resume(
    resume_id: str,
    update_data: ResumeUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Resume).where(Resume.id == resume_id, Resume.user_id == current_user.id)
    )
    resume = result.scalar_one_or_none()
    if not resume:
        raise HTTPException(status_code=404, detail="Resume not found.")

    if update_data.skills is not None:
        resume.skills = update_data.skills
    if update_data.experience is not None:
        resume.experience = update_data.experience
    if update_data.education is not None:
        resume.education = update_data.education
    if update_data.projects is not None:
        resume.projects = update_data.projects
    if update_data.summary is not None:
        resume.summary = update_data.summary

    db.add(resume)
    await db.commit()
    await db.refresh(resume)
    return resume


@router.delete("/{resume_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_resume(
    resume_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Resume).where(Resume.id == resume_id, Resume.user_id == current_user.id)
    )
    resume = result.scalar_one_or_none()
    if not resume:
        raise HTTPException(status_code=404, detail="Resume not found.")
    if resume.original_file_path and os.path.exists(resume.original_file_path):
        os.remove(resume.original_file_path)
    await db.delete(resume)
    await db.commit()
