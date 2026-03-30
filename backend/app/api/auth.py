"""
Auth routes — register, login, get current user, password reset.
"""
import hashlib
import logging
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.config import get_settings
from app.database import get_db
from app.models import User
from app.schemas import (
    UserCreate, UserResponse, TokenResponse, LoginRequest,
    ForgotPasswordRequest, ResetPasswordRequest,
)
from app.services.auth import hash_password, verify_password, create_access_token
from app.services.email import send_password_reset_email
from app.api.deps import get_current_user, user_to_public_dict

settings = get_settings()

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/auth", tags=["Auth"])


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def register(payload: UserCreate, db: AsyncSession = Depends(get_db)):
    """Create a new account and return a JWT access token."""
    # Check for existing email
    existing = await db.execute(select(User).where(User.email == payload.email.lower()))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="An account with this email already exists.")

    user = User(
        email=payload.email.lower().strip(),
        hashed_password=hash_password(payload.password),
    )
    db.add(user)
    await db.flush()
    await db.refresh(user)

    token = create_access_token(str(user.id))
    logger.info("New user registered: %s", user.email)
    return TokenResponse(access_token=token, user=UserResponse(**user_to_public_dict(user)))


@router.post("/login", response_model=TokenResponse)
async def login(payload: LoginRequest, db: AsyncSession = Depends(get_db)):
    """Authenticate with email + password and return a JWT."""
    result = await db.execute(select(User).where(User.email == payload.email.lower()))
    user = result.scalar_one_or_none()

    if not user or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid email or password.")

    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account is disabled.")

    token = create_access_token(str(user.id))
    logger.info("User logged in: %s", user.email)
    return TokenResponse(access_token=token, user=UserResponse(**user_to_public_dict(user)))


@router.get("/me", response_model=UserResponse)
async def get_me(current_user: User = Depends(get_current_user)):
    """Return the authenticated user's profile."""
    return UserResponse(**user_to_public_dict(current_user))


@router.post("/forgot-password", status_code=status.HTTP_202_ACCEPTED)
async def forgot_password(payload: ForgotPasswordRequest, db: AsyncSession = Depends(get_db)):
    """
    Send a password-reset email. Always returns 202 so we don't leak
    whether the address is registered.
    """
    result = await db.execute(select(User).where(User.email == payload.email.lower()))
    user = result.scalar_one_or_none()

    if user and user.is_active:
        raw_token = secrets.token_urlsafe(32)
        # Store a SHA-256 hash — raw token travels only in the email link
        user.password_reset_token = hashlib.sha256(raw_token.encode()).hexdigest()
        user.password_reset_expires = datetime.now(timezone.utc) + timedelta(hours=1)
        db.add(user)
        # send email (non-blocking — fire and don't wait so the response is fast)
        reset_url = f"{settings.APP_URL}/reset-password?token={raw_token}"
        import asyncio
        asyncio.create_task(send_password_reset_email(user.email, reset_url))

    return {"detail": "If that email is registered, a reset link has been sent."}


@router.post("/reset-password", status_code=status.HTTP_200_OK)
async def reset_password(payload: ResetPasswordRequest, db: AsyncSession = Depends(get_db)):
    """Validate the reset token and update the password."""
    token_hash = hashlib.sha256(payload.token.encode()).hexdigest()

    result = await db.execute(
        select(User).where(User.password_reset_token == token_hash)
    )
    user = result.scalar_one_or_none()

    if not user or not user.password_reset_expires:
        raise HTTPException(status_code=400, detail="Invalid or expired reset link.")

    if user.password_reset_expires < datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="Reset link has expired. Please request a new one.")

    user.hashed_password = hash_password(payload.new_password)
    user.password_reset_token = None
    user.password_reset_expires = None
    db.add(user)
    logger.info("Password reset for user: %s", user.email)
    return {"detail": "Password updated successfully."}
