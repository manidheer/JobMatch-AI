"""
App configuration — reads from environment variables.
"""
import secrets
from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    # Core
    APP_NAME: str = "AI Job Match Assistant"
    DEBUG: bool = False
    LOG_LEVEL: str = "INFO"

    # Auth — MUST be set in .env; a random key is generated only as a last resort
    # WARNING: a random key means all tokens are invalidated on every server restart.
    # Always set SECRET_KEY explicitly in production and development .env files.
    SECRET_KEY: str = ""
    ACCESS_TOKEN_EXPIRE_HOURS: int = 168  # 7 days

    # Docs (disabled in production)
    DOCS_URL: str = "/docs"
    REDOC_URL: str = "/redoc"

    # Database
    DATABASE_URL: str = "postgresql+asyncpg://jobmatch:jobmatch@localhost:5432/jobmatch"
    SYNC_DATABASE_URL: str = "postgresql://jobmatch:jobmatch@localhost:5432/jobmatch"

    # Connection pool
    DB_POOL_SIZE: int = 10
    DB_MAX_OVERFLOW: int = 20
    DB_POOL_TIMEOUT: int = 30

    # OpenAI
    OPENAI_API_KEY: str
    OPENAI_MODEL: str = "gpt-4o-mini"
    EMBEDDING_MODEL: str = "text-embedding-3-small"
    LLM_TIMEOUT: int = 90

    # Per-user daily AI call limit (analysis + optimize combined)
    DAILY_AI_LIMIT: int = 50

    # File storage
    UPLOAD_DIR: str = "./uploads"
    MAX_FILE_SIZE_MB: int = 10
    # Days before orphaned upload files are deleted
    FILE_RETENTION_DAYS: int = 30

    # CORS — comma-separated list of allowed origins
    ALLOWED_ORIGINS: list[str] = ["http://localhost:3000", "http://localhost:3001"]

    # Rate limiting (requests per window)
    RATE_LIMIT_ANALYZE: str = "15/minute"
    RATE_LIMIT_UPLOAD: str = "10/minute"
    RATE_LIMIT_OPTIMIZE: str = "10/minute"
    RATE_LIMIT_GLOBAL: str = "120/minute"

    # Email / password reset (optional — leave SMTP_HOST empty to disable email)
    SMTP_HOST: str = ""
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""
    SMTP_FROM: str = "JobMatch AI <noreply@jobmatch.ai>"
    # Public-facing URL included in reset-password emails
    APP_URL: str = "http://localhost:3000"

    # Authorization
    # Comma-separated admin email list; admin users are restricted to admin-only templates.
    ADMIN_EMAILS: str = "manidheerft@gmail.com"

    # Sentry (optional — leave empty to disable)
    SENTRY_DSN: str = ""

    # Job search
    RAPIDAPI_KEY: str = ""

    class Config:
        env_file = ".env"
        extra = "ignore"


@lru_cache()
def get_settings() -> Settings:
    return Settings()
