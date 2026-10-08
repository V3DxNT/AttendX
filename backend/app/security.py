from datetime import datetime, timedelta, timezone
import hashlib
import secrets
import time
from typing import Any, Callable, Dict, List, Optional, Tuple
from uuid import UUID, uuid4
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError
from fastapi import Cookie, Depends, Request, Response
import jwt

from app.config import settings
from app.database import (
    create_refresh_token,
    create_user,
    get_refresh_token,
    get_user_by_email,
    get_user_by_id,
    revoke_refresh_token,
    revoke_refresh_token_family,
)
from app.errors import AppError

ph = PasswordHasher()
DUMMY_HASH = ph.hash("dummy-attendx-password")

_login_failures: Dict[Tuple[str, str], List[float]] = {}

def get_password_hash(password: str) -> str:
    return ph.hash(password)

def verify_password(plain_password: str, hashed_password: str) -> bool:
    try:
        return ph.verify(hashed_password, plain_password)
    except Exception:
        return False

def dummy_verify_password() -> None:
    try:
        ph.verify(DUMMY_HASH, "invalid-dummy-password")
    except Exception:
        pass

def check_login_rate_limit(ip: str, email: str) -> None:
    key = (ip, email.strip().lower())
    now = time.time()
    cutoff = now - 900
    attempts = [t for t in _login_failures.get(key, []) if t > cutoff]
    _login_failures[key] = attempts
    if len(attempts) >= 5:
        raise AppError(
            code="TOO_MANY_ATTEMPTS",
            message="Too many failed login attempts. Please try again after 15 minutes.",
            status_code=429,
        )

def record_login_failure(ip: str, email: str) -> None:
    key = (ip, email.strip().lower())
    now = time.time()
    attempts = [t for t in _login_failures.get(key, []) if t > now - 900]
    attempts.append(now)
    _login_failures[key] = attempts

def clear_login_failures(ip: str, email: str) -> None:
    key = (ip, email.strip().lower())
    _login_failures.pop(key, None)

def create_access_token(user_id: UUID, role: str) -> str:
    now = datetime.now(timezone.utc)
    exp = now + timedelta(minutes=settings.JWT_ACCESS_MINUTES)
    payload = {
        "sub": str(user_id),
        "role": role,
        "iat": int(now.timestamp()),
        "exp": int(exp.timestamp()),
        "type": "access",
    }
    return jwt.encode(payload, settings.JWT_SECRET, algorithm="HS256")

def decode_access_token(token: str) -> Dict[str, Any]:
    try:
        payload = jwt.decode(
            token,
            settings.JWT_SECRET,
            algorithms=["HS256"],
            options={"require": ["exp", "iat", "sub", "type"]},
        )
        if payload.get("type") != "access":
            raise AppError(
                code="NOT_AUTHENTICATED",
                message="Invalid token type",
                status_code=401,
            )
        return payload
    except jwt.ExpiredSignatureError:
        raise AppError(
            code="NOT_AUTHENTICATED",
            message="Access token has expired",
            status_code=401,
        )
    except jwt.PyJWTError:
        raise AppError(
            code="NOT_AUTHENTICATED",
            message="Invalid access token",
            status_code=401,
        )

def generate_refresh_token() -> str:
    return secrets.token_urlsafe(32)

def hash_refresh_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()

def set_auth_cookies(response: Response, access_token: str, refresh_token: str) -> None:
    response.set_cookie(
        key="access_token",
        value=access_token,
        max_age=settings.JWT_ACCESS_MINUTES * 60,
        path="/",
        httponly=True,
        secure=settings.COOKIE_SECURE,
        samesite="lax",
    )
    response.set_cookie(
        key="refresh_token",
        value=refresh_token,
        max_age=settings.JWT_REFRESH_DAYS * 86400,
        path="/api/v1/auth",
        httponly=True,
        secure=settings.COOKIE_SECURE,
        samesite="lax",
    )

def clear_auth_cookies(response: Response) -> None:
    response.delete_cookie(
        key="access_token",
        path="/",
        httponly=True,
        secure=settings.COOKIE_SECURE,
        samesite="lax",
    )
    response.delete_cookie(
        key="refresh_token",
        path="/api/v1/auth",
        httponly=True,
        secure=settings.COOKIE_SECURE,
        samesite="lax",
    )

async def verify_csrf_header(request: Request) -> None:
    if request.method in ("POST", "PUT", "PATCH", "DELETE"):
        header_val = request.headers.get("X-Requested-With")
        if header_val != "AttendX":
            raise AppError(
                code="CSRF_HEADER_MISSING",
                message="Missing or invalid X-Requested-With header",
                status_code=403,
            )

async def get_current_user(
    request: Request,
    access_token: Optional[str] = Cookie(default=None),
) -> dict:
    if not access_token:
        raise AppError(
            code="NOT_AUTHENTICATED",
            message="Authentication credentials were not provided",
            status_code=401,
        )
    payload = decode_access_token(access_token)
    user_id_str = payload.get("sub")
    if not user_id_str:
        raise AppError(
            code="NOT_AUTHENTICATED",
            message="Token subject missing",
            status_code=401,
        )
    try:
        user_id = UUID(user_id_str)
    except ValueError:
        raise AppError(
            code="NOT_AUTHENTICATED",
            message="Invalid user ID in token",
            status_code=401,
        )
    user = await get_user_by_id(user_id)
    if not user:
        raise AppError(
            code="NOT_AUTHENTICATED",
            message="User not found",
            status_code=401,
        )
    if not user.get("is_active"):
        raise AppError(
            code="ACCOUNT_DISABLED",
            message="Account has been disabled",
            status_code=403,
        )
    return user

def require_role(role: str) -> Callable:
    async def role_checker(current_user: dict = Depends(get_current_user)) -> dict:
        if current_user.get("role") != role:
            raise AppError(
                code="FORBIDDEN",
                message="Access forbidden for user role",
                status_code=403,
            )
        return current_user
    return role_checker

async def bootstrap_admin() -> None:
    if settings.ADMIN_EMAIL and settings.ADMIN_PASSWORD:
        admin_email = settings.ADMIN_EMAIL.strip().lower()
        existing = await get_user_by_email(admin_email)
        if not existing:
            p_hash = get_password_hash(settings.ADMIN_PASSWORD)
            await create_user(
                email=admin_email,
                full_name="System Administrator",
                password_hash=p_hash,
                role="admin",
            )
