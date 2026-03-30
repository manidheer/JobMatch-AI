"""
Shared rate-limiter instance — imported by both main.py and API routers.
Kept in its own module to avoid circular imports.
"""
from slowapi import Limiter
from slowapi.util import get_remote_address
from app.config import get_settings

settings = get_settings()

limiter = Limiter(
    key_func=get_remote_address,
    default_limits=[settings.RATE_LIMIT_GLOBAL],
)
