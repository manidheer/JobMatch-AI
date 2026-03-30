"""
SQLAlchemy ORM models for the Job Match Assistant.
"""
import uuid
from datetime import datetime, date
from sqlalchemy import String, Text, Float, DateTime, Date, Boolean, Integer, ForeignKey, Index
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func
from app.database import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    hashed_password: Mapped[str] = mapped_column(Text, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    # Daily AI call tracking
    ai_calls_today: Mapped[int] = mapped_column(Integer, default=0)
    ai_calls_reset_date: Mapped[date | None] = mapped_column(Date, nullable=True)

    # Password reset (hashed token + expiry)
    password_reset_token: Mapped[str | None] = mapped_column(Text, nullable=True)
    password_reset_expires: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Relationships
    resumes: Mapped[list["Resume"]] = relationship(
        "Resume", back_populates="user", cascade="all, delete-orphan"
    )
    tracked_jobs: Mapped[list["TrackedJob"]] = relationship(
        "TrackedJob", back_populates="user", cascade="all, delete-orphan"
    )


class Resume(Base):
    __tablename__ = "resumes"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    # User ownership (nullable for backward-compat with pre-auth records)
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=True
    )
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    raw_text: Mapped[str] = mapped_column(Text, nullable=False)
    skills: Mapped[list] = mapped_column(JSONB, default=list)
    experience: Mapped[list] = mapped_column(JSONB, default=list)
    education: Mapped[list] = mapped_column(JSONB, default=list)
    projects: Mapped[list] = mapped_column(JSONB, default=list)
    summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    original_file_path: Mapped[str | None] = mapped_column(Text, nullable=True)
    file_type: Mapped[str | None] = mapped_column(String(10), nullable=True)
    embedding: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    user: Mapped["User | None"] = relationship("User", back_populates="resumes")
    tracked_jobs: Mapped[list["TrackedJob"]] = relationship(
        "TrackedJob", back_populates="resume", cascade="all, delete-orphan"
    )

    __table_args__ = (
        Index("ix_resumes_user_id", "user_id"),
        Index("ix_resumes_created_at", "created_at"),
    )


class TrackedJob(Base):
    __tablename__ = "tracked_jobs"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    # User ownership (nullable for backward-compat)
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=True
    )
    resume_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("resumes.id", ondelete="CASCADE"), nullable=False
    )
    job_title: Mapped[str] = mapped_column(String(500), nullable=False)
    company: Mapped[str | None] = mapped_column(String(255), nullable=True)
    job_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    job_description: Mapped[str] = mapped_column(Text, nullable=False)
    match_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    matched_skills: Mapped[list] = mapped_column(JSONB, default=list)
    missing_skills: Mapped[list] = mapped_column(JSONB, default=list)
    recommended_skills: Mapped[list] = mapped_column(JSONB, default=list)
    experience_gaps: Mapped[list] = mapped_column(JSONB, default=list)
    learning_resources: Mapped[dict] = mapped_column(JSONB, default=dict)
    jd_structured: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    reasoning: Mapped[str | None] = mapped_column(Text, nullable=True)
    semantic_boost: Mapped[float | None] = mapped_column(Float, nullable=True)
    status: Mapped[str] = mapped_column(String(50), default="analyzed")
    priority_group: Mapped[str] = mapped_column(String(50), default="normal")
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    strengths: Mapped[list] = mapped_column(JSONB, default=list)
    quick_wins: Mapped[list] = mapped_column(JSONB, default=list)
    eligibility_flags: Mapped[list] = mapped_column(JSONB, default=list)
    match_label: Mapped[str | None] = mapped_column(String(100), nullable=True)
    python_match_stats: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    user: Mapped["User | None"] = relationship("User", back_populates="tracked_jobs")
    resume: Mapped["Resume"] = relationship("Resume", back_populates="tracked_jobs")
    optimized_resumes: Mapped[list["OptimizedResume"]] = relationship(
        "OptimizedResume", back_populates="tracked_job", cascade="all, delete-orphan"
    )
    cover_letters: Mapped[list["CoverLetter"]] = relationship(
        "CoverLetter", back_populates="tracked_job", cascade="all, delete-orphan"
    )

    __table_args__ = (
        Index("ix_tracked_jobs_user_id", "user_id"),
        Index("ix_tracked_jobs_resume_id", "resume_id"),
        Index("ix_tracked_jobs_created_at", "created_at"),
        Index("ix_tracked_jobs_status", "status"),
        Index("ix_tracked_jobs_user_created", "user_id", "created_at"),
    )


class OptimizedResume(Base):
    __tablename__ = "optimized_resumes"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    tracked_job_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tracked_jobs.id", ondelete="CASCADE")
    )
    resume_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("resumes.id", ondelete="CASCADE")
    )
    optimized_text: Mapped[str] = mapped_column(Text, nullable=False)
    original_resume_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    pdf_path: Mapped[str | None] = mapped_column(Text, nullable=True)
    docx_path: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    tracked_job: Mapped["TrackedJob"] = relationship("TrackedJob", back_populates="optimized_resumes")


class CoverLetter(Base):
    __tablename__ = "cover_letters"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    tracked_job_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tracked_jobs.id", ondelete="CASCADE")
    )
    content: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    tracked_job: Mapped["TrackedJob"] = relationship("TrackedJob", back_populates="cover_letters")
