"""
Database engine, session factory, and base ORM class.
"""
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from app.config import get_settings

settings = get_settings()

engine = create_async_engine(
    settings.DATABASE_URL,
    echo=settings.DEBUG,
    pool_pre_ping=True,
    pool_size=settings.DB_POOL_SIZE,
    max_overflow=settings.DB_MAX_OVERFLOW,
    pool_timeout=settings.DB_POOL_TIMEOUT,
    pool_recycle=1800,
)

AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


class Base(DeclarativeBase):
    pass


async def get_db() -> AsyncSession:
    """FastAPI dependency — yields a database session."""
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


async def create_tables():
    """Create all tables on startup."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


async def run_migrations():
    """Safe, idempotent schema migrations for columns and indexes added after initial deploy."""
    from sqlalchemy import text
    migrations = [
        # ── New columns ──────────────────────────────────────────────────────
        "ALTER TABLE optimized_resumes ADD COLUMN IF NOT EXISTS original_resume_text TEXT",
        "ALTER TABLE resumes ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE CASCADE",
        "ALTER TABLE tracked_jobs ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE CASCADE",
        # ── Users table AI call tracking (added after initial user table deploy) ──
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS ai_calls_today INTEGER DEFAULT 0",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS ai_calls_reset_date DATE",
        # ── Indexes ───────────────────────────────────────────────────────────
        "CREATE INDEX IF NOT EXISTS ix_resumes_created_at ON resumes (created_at DESC)",
        "CREATE INDEX IF NOT EXISTS ix_resumes_user_id ON resumes (user_id)",
        "CREATE INDEX IF NOT EXISTS ix_tracked_jobs_resume_id ON tracked_jobs (resume_id)",
        "CREATE INDEX IF NOT EXISTS ix_tracked_jobs_created_at ON tracked_jobs (created_at DESC)",
        "CREATE INDEX IF NOT EXISTS ix_tracked_jobs_status ON tracked_jobs (status)",
        "CREATE INDEX IF NOT EXISTS ix_tracked_jobs_user_id ON tracked_jobs (user_id)",
        "CREATE INDEX IF NOT EXISTS ix_tracked_jobs_user_created ON tracked_jobs (user_id, created_at DESC)",
        # ── Password reset columns ────────────────────────────────────────────
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS password_reset_token TEXT",
        "ALTER TABLE users ADD COLUMN IF NOT EXISTS password_reset_expires TIMESTAMPTZ",
        # ── Claim legacy data: assign unowned rows to the oldest user ─────────
        # Runs every startup but only affects rows where user_id IS NULL.
        # Safe on subsequent runs (0 rows matched once all data is claimed).
        """
        UPDATE resumes
        SET user_id = (SELECT id FROM users ORDER BY created_at ASC LIMIT 1)
        WHERE user_id IS NULL
          AND EXISTS (SELECT 1 FROM users)
        """,
        """
        UPDATE tracked_jobs
        SET user_id = (SELECT id FROM users ORDER BY created_at ASC LIMIT 1)
        WHERE user_id IS NULL
          AND EXISTS (SELECT 1 FROM users)
        """,
    ]
    async with engine.begin() as conn:
        for stmt in migrations:
            try:
                await conn.execute(text(stmt))
            except Exception:
                pass  # column/index already exists or unsupported — safe to ignore
