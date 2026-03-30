"""
Pydantic schemas for request/response validation.
"""
import uuid
from datetime import datetime
from typing import Any, Optional
from pydantic import BaseModel, ConfigDict, EmailStr, field_validator


# ─── Auth Schemas ─────────────────────────────────────────────────────────────

class UserCreate(BaseModel):
    email: EmailStr
    password: str

    @field_validator("password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters.")
        return v


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    email: str
    is_active: bool
    created_at: datetime
    ai_calls_today: int = 0
    is_admin: bool = False
    allowed_templates: list[str] = []


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str

    @field_validator("new_password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters.")
        return v


# ─── Resume Schemas ──────────────────────────────────────────────────────────

class ResumeBase(BaseModel):
    filename: str
    skills: list[str] = []
    experience: list[dict[str, Any]] = []
    education: list[dict[str, Any]] = []
    projects: list[dict[str, Any]] = []
    summary: Optional[str] = None


class ResumeCreate(ResumeBase):
    raw_text: str


class ResumeUpdate(BaseModel):
    skills: Optional[list[str]] = None
    experience: Optional[list[dict[str, Any]]] = None
    education: Optional[list[dict[str, Any]]] = None
    projects: Optional[list[dict[str, Any]]] = None
    summary: Optional[str] = None


class ResumeResponse(ResumeBase):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    raw_text: str
    created_at: datetime


# ─── Job Schemas ──────────────────────────────────────────────────────────────

class JobSearchRequest(BaseModel):
    title: str
    location: str = "United States"
    employment_type: str = "FULLTIME"
    num_results: int = 8


class JobScrapeRequest(BaseModel):
    url: str


class JobManualRequest(BaseModel):
    job_title: str
    company: Optional[str] = None
    job_url: Optional[str] = None
    job_description: str


class JobListingItem(BaseModel):
    job_title: str
    company: Optional[str] = None
    location: Optional[str] = None
    job_url: Optional[str] = None
    job_description: str
    salary: Optional[str] = None
    posted_date: Optional[str] = None
    employment_type: Optional[str] = None


class JobListingResponse(BaseModel):
    jobs: list[JobListingItem]
    source: str  # 'api' | 'fallback'


# ─── Analysis Schemas ─────────────────────────────────────────────────────────

class AnalyzeRequest(BaseModel):
    resume_id: uuid.UUID
    job_title: str
    company: Optional[str] = None
    job_url: Optional[str] = None
    job_description: str
    mode: str = "deep"
    persist: bool = False  # Default to NOT saving to DB now
    jd_structured: Optional[dict] = None

class AnalysisReport(BaseModel):
    """Raw AI analysis results before saving to DB."""
    job_title: str
    company: Optional[str] = None
    job_url: Optional[str] = None
    job_description: str
    match_score: float = 0.0
    match_label: Optional[str] = None
    matched_skills: list[str] = []
    missing_skills: list[str] = []
    recommended_skills: list[str] = []
    experience_gaps: list[str] = []
    learning_resources: dict[str, list[dict]] = {}
    reasoning: Optional[str] = None
    jd_structured: Optional[dict] = None
    priority_group: Optional[str] = "normal"
    # Extra fields returned by AI analyzer
    semantic_boost: Optional[float] = None
    strengths: list[str] = []
    quick_wins: list[str] = []
    eligibility_flags: list[str] = []
    python_match_stats: Optional[dict] = None

class SaveAnalysisRequest(BaseModel):
    """Request to persist an analysis into tracking."""
    resume_id: uuid.UUID
    analysis: AnalysisReport
    status: str = "analyzed"



class ManualTrackRequest(BaseModel):
    resume_id: uuid.UUID
    job_title: str
    company: Optional[str] = None
    job_url: Optional[str] = None
    status: str = "applied"
    priority_group: Optional[str] = "normal"
    notes: Optional[str] = None


class LearningResource(BaseModel):
    title: str
    url: str
    type: str = "course"  # article | course | docs


class AnalysisResult(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    resume_id: uuid.UUID
    job_title: str
    company: Optional[str] = None
    job_url: Optional[str] = None
    job_description: str  # Added to allow side-by-side view to show raw JD
    match_score: float
    matched_skills: list[str]
    missing_skills: list[str]
    recommended_skills: list[str]
    experience_gaps: list[str]
    learning_resources: dict[str, list[dict]] = {}
    reasoning: Optional[str] = None
    semantic_boost: Optional[float] = None
    jd_structured: Optional[dict] = None
    status: str
    priority_group: str = "normal"
    notes: Optional[str] = None
    created_at: datetime
    
    # Extra fields for rich analysis
    strengths: list[str] = []
    quick_wins: list[str] = []
    eligibility_flags: list[str] = []
    match_label: Optional[str] = None
    python_match_stats: Optional[dict] = None


# ─── Optimization Schemas ──────────────────────────────────────────────────────

class TrackedJobUpdate(BaseModel):
    status: Optional[str] = None
    priority_group: Optional[str] = None
    notes: Optional[str] = None
    job_title: Optional[str] = None
    company: Optional[str] = None
    job_url: Optional[str] = None
    jd_structured: Optional[dict] = None


class OptimizeResumeRequest(BaseModel):
    tracked_job_id: uuid.UUID
    resume_id: uuid.UUID
    template_type: str = "modern"


class OptimizedResumeResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    tracked_job_id: uuid.UUID
    optimized_text: str
    original_resume_text: Optional[str] = None  # JSON snapshot of original resume_data
    pdf_path: Optional[str] = None
    docx_path: Optional[str] = None   # DOCX download available
    created_at: datetime


class CoverLetterRequest(BaseModel):
    tracked_job_id: uuid.UUID
    resume_id: uuid.UUID


class CoverLetterResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    tracked_job_id: uuid.UUID
    content: str
    created_at: datetime


# ─── Dashboard Schemas ────────────────────────────────────────────────────────

class DashboardStats(BaseModel):
    total_jobs_analyzed: int
    average_match_score: float
    top_missing_skills: list[str]
    jobs_applied: int
