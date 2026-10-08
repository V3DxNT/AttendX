from typing import Any, List, Optional
from uuid import UUID
import re
from pydantic import BaseModel, EmailStr, Field, field_validator

class UserResponse(BaseModel):
    id: UUID
    email: str
    full_name: str
    role: str

class SignupRequest(BaseModel):
    email: EmailStr
    full_name: str = Field(..., min_length=1, max_length=100)
    password: str = Field(..., min_length=8, max_length=128)
    invite_code: str

    @field_validator("password")
    @classmethod
    def validate_password(cls, v: str, info: Any) -> str:
        values = info.data
        email = values.get("email")
        if email and v.strip() == email.strip():
            raise ValueError("Password cannot be identical to email")
        return v

class LoginRequest(BaseModel):
    email: EmailStr
    password: str

class StudentRegisterRequest(BaseModel):
    usn: str
    full_name: str = Field(..., min_length=1, max_length=100)
    image_base64: str
    extra_images_base64: Optional[List[str]] = Field(default=None, max_length=2)

    @field_validator("usn")
    @classmethod
    def validate_usn(cls, v: str) -> str:
        v_upper = v.strip().upper()
        if not re.match(r"^[A-Z0-9]{6,20}$", v_upper):
            raise ValueError("USN must be 6-20 alphanumeric characters")
        return v_upper

class StudentSummary(BaseModel):
    usn: str
    full_name: str
    thumbnail: str

class StudentListResponse(BaseModel):
    status: str = "SUCCESS"
    total: int
    items: List[StudentSummary]

class SessionCreateRequest(BaseModel):
    subject_name: str = Field(..., min_length=1, max_length=100)
    subject_code: str = Field(..., min_length=1, max_length=20)

class SessionSummary(BaseModel):
    id: str
    subject_name: str
    subject_code: str
    session_date: str
    started_at: str
    ended_at: Optional[str] = None
    is_active: bool
    total_present: int

class SessionMarkRequest(BaseModel):
    image_base64: str

class SessionManualRecordRequest(BaseModel):
    usn: str

    @field_validator("usn")
    @classmethod
    def validate_usn(cls, v: str) -> str:
        return v.strip().upper()

class DashboardAttendee(BaseModel):
    usn: str
    full_name: str
    thumbnail: str
    marked_at: str
    method: str

class SessionDashboardResponse(BaseModel):
    status: str = "SUCCESS"
    session_id: str
    subject_name: str
    subject_code: str
    session_date: str
    is_active: bool
    total_present: int
    total_enrolled: int
    attendees: List[DashboardAttendee]
