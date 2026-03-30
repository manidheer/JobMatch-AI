"""
Shared FastAPI dependencies — authentication and rate-limit helpers.
"""
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_db
from app.models import User
from app.services.auth import decode_access_token
from app.config import get_settings

settings = get_settings()

_bearer = HTTPBearer(auto_error=True)


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(_bearer),
    db: AsyncSession = Depends(get_db),
) -> User:
    """Validate JWT and return the authenticated User row."""
    user_id = decode_access_token(credentials.credentials)
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found or account disabled.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user


def is_admin_user(user: User) -> bool:
    admins = {
        e.strip().lower()
        for e in (settings.ADMIN_EMAILS or "").split(",")
        if e.strip()
    }
    return user.email.lower() in admins


def get_allowed_templates_for_user(user: User) -> list[str]:
    # Admin account is resume-specific and restricted to Mani template.
    if is_admin_user(user):
        return ["mani"]
    return ["modern", "classic"]


def ensure_template_allowed(user: User, template_type: str) -> str:
    normalized = (template_type or "").strip().lower()
    allowed = get_allowed_templates_for_user(user)
    if normalized not in allowed:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Template '{template_type}' is not allowed for this account.",
        )
    return normalized


def user_to_public_dict(user: User) -> dict:
    return {
        "id": user.id,
        "email": user.email,
        "is_active": user.is_active,
        "created_at": user.created_at,
        "ai_calls_today": user.ai_calls_today,
        "is_admin": is_admin_user(user),
        "allowed_templates": get_allowed_templates_for_user(user),
    }
