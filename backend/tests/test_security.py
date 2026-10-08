import time
from uuid import uuid4
import pytest
from pydantic import ValidationError

from app.errors import AppError
from app.schemas import SignupRequest
from app.security import (
    check_login_rate_limit,
    create_access_token,
    decode_access_token,
    generate_refresh_token,
    get_password_hash,
    hash_refresh_token,
    record_login_failure,
    verify_password,
)

def test_password_hashing():
    pw = "SecretPass123!"
    hashed = get_password_hash(pw)
    assert hashed != pw
    assert verify_password(pw, hashed) is True
    assert verify_password("WrongPassword!", hashed) is False

def test_signup_schema_validation():
    with pytest.raises(ValidationError):
        SignupRequest(
            email="test@example.com",
            full_name="Test User",
            password="test@example.com",
            invite_code="invite",
        )

    with pytest.raises(ValidationError):
        SignupRequest(
            email="test@example.com",
            full_name="Test User",
            password="short",
            invite_code="invite",
        )

def test_access_token_creation_and_decode():
    uid = uuid4()
    token = create_access_token(uid, "teacher")
    payload = decode_access_token(token)
    assert payload["sub"] == str(uid)
    assert payload["role"] == "teacher"
    assert payload["type"] == "access"

def test_refresh_token_hashing():
    token = generate_refresh_token()
    assert len(token) > 20
    hashed = hash_refresh_token(token)
    assert len(hashed) == 64
    assert hash_refresh_token(token) == hashed

def test_rate_limiting():
    ip = "192.168.1.100"
    email = "target@example.com"
    for _ in range(4):
        record_login_failure(ip, email)
    check_login_rate_limit(ip, email)
    record_login_failure(ip, email)
    with pytest.raises(AppError) as exc_info:
        check_login_rate_limit(ip, email)
    assert exc_info.value.code == "TOO_MANY_ATTEMPTS"
