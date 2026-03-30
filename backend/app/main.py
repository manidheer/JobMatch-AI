"""
FastAPI application entrypoint.
"""
import asyncio
import logging
import os
import time
import uuid
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from app.config import get_settings
from app.database import create_tables, run_migrations
from app.limiter import limiter
from app.api import resume, jobs, analysis, optimize
from app.api.auth import router as auth_router

settings = get_settings()

# ─── Logging ──────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=getattr(logging, settings.LOG_LEVEL.upper(), logging.INFO),
    format="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
)
logger = logging.getLogger(__name__)

# ─── Sentry (optional) ────────────────────────────────────────────────────────
if settings.SENTRY_DSN:
    import sentry_sdk
    sentry_sdk.init(
        dsn=settings.SENTRY_DSN,
        traces_sample_rate=0.1,
        profiles_sample_rate=0.05,
    )
    logger.info("Sentry error tracking enabled.")


# ─── File cleanup background task ─────────────────────────────────────────────
async def _cleanup_old_files():
    """Delete files in uploads/ that are older than FILE_RETENTION_DAYS and have no DB reference."""
    import glob as glob_module
    from datetime import datetime, timezone, timedelta
    from sqlalchemy import select, text
    from app.database import AsyncSessionLocal
    from app.models import Resume, OptimizedResume

    cutoff = datetime.now(timezone.utc) - timedelta(days=settings.FILE_RETENTION_DAYS)
    upload_dir = settings.UPLOAD_DIR
    deleted = 0

    # Collect all tracked file paths from DB
    async with AsyncSessionLocal() as db:
        resume_paths = (await db.execute(
            select(Resume.original_file_path).where(Resume.original_file_path.isnot(None))
        )).scalars().all()
        opt_docx = (await db.execute(
            select(OptimizedResume.docx_path).where(OptimizedResume.docx_path.isnot(None))
        )).scalars().all()
        opt_pdf = (await db.execute(
            select(OptimizedResume.pdf_path).where(OptimizedResume.pdf_path.isnot(None))
        )).scalars().all()

    known_paths = set(filter(None, list(resume_paths) + list(opt_docx) + list(opt_pdf)))

    for dirpath, _, filenames in os.walk(upload_dir):
        for fname in filenames:
            fpath = os.path.join(dirpath, fname)
            try:
                mtime = datetime.fromtimestamp(os.path.getmtime(fpath), tz=timezone.utc)
                if mtime < cutoff and fpath not in known_paths:
                    os.remove(fpath)
                    deleted += 1
            except OSError:
                pass

    if deleted:
        logger.info("File cleanup: removed %d orphaned file(s) older than %d days.", deleted, settings.FILE_RETENTION_DAYS)


async def _periodic_cleanup():
    """Run file cleanup once on startup, then every 24 hours."""
    await asyncio.sleep(60)  # wait 1 min after startup
    while True:
        try:
            await _cleanup_old_files()
        except Exception as e:
            logger.warning("File cleanup error: %s", e)
        await asyncio.sleep(86400)  # 24 hours


@asynccontextmanager
async def lifespan(app: FastAPI):
    if not settings.OPENAI_API_KEY:
        logger.critical("OPENAI_API_KEY is not set — AI features will not work.")
    if not settings.SECRET_KEY:
        import secrets as _secrets
        settings.SECRET_KEY = _secrets.token_hex(32)
        logger.critical(
            "SECRET_KEY is not set in .env — using a temporary random key. "
            "ALL TOKENS WILL BE INVALIDATED ON EVERY SERVER RESTART. "
            "Set SECRET_KEY in your .env file to fix this."
        )
    logger.info("Starting %s (debug=%s)…", settings.APP_NAME, settings.DEBUG)
    await create_tables()
    await run_migrations()
    logger.info("Database ready.")
    cleanup_task = asyncio.create_task(_periodic_cleanup())
    yield
    cleanup_task.cancel()
    logger.info("Shutting down.")


# ─── App ──────────────────────────────────────────────────────────────────────
app = FastAPI(
    title=settings.APP_NAME,
    description="AI-powered job matching and resume optimization API",
    version="1.0.0",
    lifespan=lifespan,
    docs_url=settings.DOCS_URL if settings.DEBUG else None,
    redoc_url=settings.REDOC_URL if settings.DEBUG else None,
    openapi_url="/openapi.json" if settings.DEBUG else None,
)

# Attach rate limiter
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# ─── Middleware ────────────────────────────────────────────────────────────────
app.add_middleware(GZipMiddleware, minimum_size=1000)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def request_context_middleware(request: Request, call_next):
    request_id = request.headers.get("X-Request-ID") or str(uuid.uuid4())
    start = time.perf_counter()
    try:
        response = await call_next(request)
    except Exception as exc:
        logger.error("Unhandled exception [%s] %s %s: %s",
                     request_id, request.method, request.url.path, exc, exc_info=True)
        response = JSONResponse(status_code=500, content={"detail": "Internal server error."})
    duration = time.perf_counter() - start
    response.headers["X-Request-ID"] = request_id
    response.headers["X-Process-Time"] = f"{duration:.4f}s"
    # Security headers
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "geolocation=(), microphone=(), camera=()"
    if not settings.DEBUG:
        # HSTS — only set over HTTPS in production
        response.headers["Strict-Transport-Security"] = "max-age=63072000; includeSubDomains; preload"
    return response


# ─── Routers ──────────────────────────────────────────────────────────────────
app.include_router(auth_router)
app.include_router(resume.router)
app.include_router(jobs.router)
app.include_router(analysis.router)
app.include_router(optimize.router)


@app.get("/health", tags=["Health"])
@app.get("/api/health", tags=["Health"])
async def health_check():
    from app.database import engine
    from sqlalchemy import text
    db_status = "ok"
    try:
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
    except Exception as e:
        logger.warning("Health check DB ping failed: %s", e)
        db_status = "degraded"
    return {"status": "ok", "db": db_status, "service": settings.APP_NAME, "version": "1.0.0"}
