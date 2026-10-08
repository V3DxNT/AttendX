from datetime import datetime, timedelta, timezone
from typing import Optional
from uuid import uuid4
from fastapi import APIRouter, Cookie, Depends, Request, Response, status

from app.config import settings
from app.database import (
    create_refresh_token,
    create_user,
    get_refresh_token,
    get_user_by_email,
    get_user_by_id,
    revoke_refresh_token,
    revoke_refresh_token_family,
    update_user_last_login,
)
from app.errors import AppError
from app.schemas import LoginRequest, SignupRequest
from app.security import (
    check_login_rate_limit,
    clear_auth_cookies,
    clear_login_failures,
    create_access_token,
    dummy_verify_password,
    generate_refresh_token,
    get_current_user,
    get_password_hash,
    hash_refresh_token,
    record_login_failure,
    set_auth_cookies,
    verify_password,
)

router = APIRouter(prefix="/auth", tags=["auth"])

def get_client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "127.0.0.1"

@router.post("/signup", status_code=status.HTTP_201_CREATED)
async def signup(body: SignupRequest, response: Response, request: Request):
    if body.invite_code.strip() != settings.SIGNUP_INVITE_CODE.strip():
        raise AppError(
            code="INVALID_INVITE_CODE",
            message="Invalid signup invite code",
            status_code=403,
        )

    existing_user = await get_user_by_email(body.email)
    if existing_user:
        raise AppError(
            code="EMAIL_EXISTS",
            message="An account with this email already exists",
            status_code=409,
        )

    password_hash = get_password_hash(body.password)
    user = await create_user(
        email=body.email,
        full_name=body.full_name,
        password_hash=password_hash,
        role="teacher",
    )

    access_token = create_access_token(user["id"], user["role"])
    raw_refresh = generate_refresh_token()
    token_hash = hash_refresh_token(raw_refresh)
    family_id = uuid4()
    expires_at = datetime.now(timezone.utc) + timedelta(days=settings.JWT_REFRESH_DAYS)

    await create_refresh_token(
        user_id=user["id"],
        family_id=family_id,
        token_hash=token_hash,
        expires_at=expires_at,
        user_agent=request.headers.get("user-agent"),
    )

    set_auth_cookies(response, access_token, raw_refresh)

    return {
        "status": "SUCCESS",
        "user": {
            "id": str(user["id"]),
            "email": user["email"],
            "full_name": user["full_name"],
            "role": user["role"],
        },
    }

@router.post("/login")
async def login(body: LoginRequest, response: Response, request: Request):
    ip = get_client_ip(request)
    check_login_rate_limit(ip, body.email)

    user = await get_user_by_email(body.email)
    if not user:
        dummy_verify_password()
        record_login_failure(ip, body.email)
        raise AppError(
            code="INVALID_CREDENTIALS",
            message="Invalid email or password",
            status_code=401,
        )

    if not verify_password(body.password, user["password_hash"]):
        record_login_failure(ip, body.email)
        raise AppError(
            code="INVALID_CREDENTIALS",
            message="Invalid email or password",
            status_code=401,
        )

    if not user.get("is_active"):
        raise AppError(
            code="ACCOUNT_DISABLED",
            message="Account has been disabled",
            status_code=403,
        )

    clear_login_failures(ip, body.email)
    await update_user_last_login(user["id"])

    access_token = create_access_token(user["id"], user["role"])
    raw_refresh = generate_refresh_token()
    token_hash = hash_refresh_token(raw_refresh)
    family_id = uuid4()
    expires_at = datetime.now(timezone.utc) + timedelta(days=settings.JWT_REFRESH_DAYS)

    await create_refresh_token(
        user_id=user["id"],
        family_id=family_id,
        token_hash=token_hash,
        expires_at=expires_at,
        user_agent=request.headers.get("user-agent"),
    )

    set_auth_cookies(response, access_token, raw_refresh)

    return {
        "status": "SUCCESS",
        "user": {
            "id": str(user["id"]),
            "email": user["email"],
            "full_name": user["full_name"],
            "role": user["role"],
        },
    }

@router.post("/refresh")
async def refresh(
    request: Request,
    response: Response,
    refresh_token: Optional[str] = Cookie(default=None),
):
    if not refresh_token:
        raise AppError(
            code="INVALID_REFRESH_TOKEN",
            message="Refresh token missing",
            status_code=401,
        )

    token_hash = hash_refresh_token(refresh_token)
    record = await get_refresh_token(token_hash)
    if not record:
        raise AppError(
            code="INVALID_REFRESH_TOKEN",
            message="Invalid refresh token",
            status_code=401,
        )

    if record.get("revoked_at") is not None:
        await revoke_refresh_token_family(record["family_id"])
        clear_auth_cookies(response)
        raise AppError(
            code="TOKEN_REUSE_DETECTED",
            message="Refresh token reuse detected. All sessions revoked.",
            status_code=401,
        )

    expires_at = record["expires_at"]
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if expires_at < datetime.now(timezone.utc):
        raise AppError(
            code="INVALID_REFRESH_TOKEN",
            message="Refresh token expired",
            status_code=401,
        )

    user = await get_user_by_id(record["user_id"])
    if not user or not user.get("is_active"):
        clear_auth_cookies(response)
        raise AppError(
            code="ACCOUNT_DISABLED",
            message="Account inactive",
            status_code=403,
        )

    await revoke_refresh_token(token_hash)

    new_access = create_access_token(user["id"], user["role"])
    new_raw_refresh = generate_refresh_token()
    new_token_hash = hash_refresh_token(new_raw_refresh)
    new_expires = datetime.now(timezone.utc) + timedelta(days=settings.JWT_REFRESH_DAYS)

    await create_refresh_token(
        user_id=user["id"],
        family_id=record["family_id"],
        token_hash=new_token_hash,
        expires_at=new_expires,
        user_agent=request.headers.get("user-agent"),
    )

    set_auth_cookies(response, new_access, new_raw_refresh)
    return {"status": "SUCCESS", "message": "Tokens refreshed successfully"}

@router.post("/logout")
async def logout(
    response: Response,
    refresh_token: Optional[str] = Cookie(default=None),
):
    if refresh_token:
        token_hash = hash_refresh_token(refresh_token)
        record = await get_refresh_token(token_hash)
        if record:
            await revoke_refresh_token_family(record["family_id"])
    clear_auth_cookies(response)
    return {"status": "SUCCESS", "message": "Logged out successfully"}

@router.get("/me")
async def me(current_user: dict = Depends(get_current_user)):
    return {
        "status": "SUCCESS",
        "user": {
            "id": str(current_user["id"]),
            "email": current_user["email"],
            "full_name": current_user["full_name"],
            "role": current_user["role"],
        },
    }
