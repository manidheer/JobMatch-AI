"""
Auth utilities — JWT creation/verification and password hashing.
"""
import warnings
from datetime import datetime, timedelta, timezone
from typing import Optional

from jose import JWTError, jwt
# passlib 1.7.4 triggers a harmless AttributeError on bcrypt.__about__ (removed in bcrypt 4+)
with warnings.catch_warnings():
    warnings.filterwarnings("ignore", category=UserWarning, module="passlib")
    from passlib.context import CryptContext

from app.config import get_settings

settings = get_settings()

_pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


# ─── Password helpers ─────────────────────────────────────────────────────────

def verify_password(plain: str, hashed: str) -> bool:
    return _pwd_context.verify(plain, hashed)


def hash_password(plain: str) -> str:
    return _pwd_context.hash(plain)


# ─── JWT helpers ──────────────────────────────────────────────────────────────

def create_access_token(user_id: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(hours=settings.ACCESS_TOKEN_EXPIRE_HOURS)
    payload = {"sub": user_id, "exp": expire}
    return jwt.encode(payload, settings.SECRET_KEY, algorithm="HS256")


def decode_access_token(token: str) -> Optional[str]:
    """Return the user_id (sub) from a valid token, or None if invalid/expired."""
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=["HS256"])
        return payload.get("sub")
    except JWTError:
        return None
