import pytest
from starlette.testclient import TestClient

from app.main import app

client = TestClient(app, raise_server_exceptions=False)

def test_health_check():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "healthy"}

def test_csrf_middleware_blocks_missing_header():
    response = client.post("/api/v1/auth/signup", json={})
    assert response.status_code == 403
    data = response.json()
    assert data["status"] == "ERROR"
    assert data["code"] == "CSRF_HEADER_MISSING"

def test_csrf_middleware_allows_with_header():
    response = client.post(
        "/api/v1/auth/signup",
        json={},
        headers={"X-Requested-With": "AttendX"},
    )
    assert response.status_code == 422
    data = response.json()
    assert data["status"] == "ERROR"
    assert data["code"] == "VALIDATION_ERROR"
    assert "data" in data

def test_error_envelope_structure():
    response = client.get("/api/v1/students/nonexistent-student-usn")
    assert response.status_code == 401
    data = response.json()
    assert data["status"] == "ERROR"
    assert data["code"] == "NOT_AUTHENTICATED"
    assert "message" in data
