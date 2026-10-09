from functools import lru_cache
from typing import Optional
from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=(".env", "backend/.env"), extra="ignore")

    DATABASE_URL: str = "postgresql://postgres:postgres@localhost:5432/postgres"
    JWT_SECRET: str = "change-me-to-at-least-32-random-bytes"
    JWT_ACCESS_MINUTES: int = 15
    JWT_REFRESH_DAYS: int = 7
    COOKIE_SECURE: bool = False
    SIGNUP_INVITE_CODE: str = "change-me"
    ADMIN_EMAIL: Optional[str] = None
    ADMIN_PASSWORD: Optional[str] = None
    FRONTEND_URL: str = "http://localhost:3000"
    MATCH_THRESHOLD: float = 0.40
    DUPLICATE_THRESHOLD: float = 0.30
    MAX_IMAGE_BYTES: int = 2097152
    INSIGHTFACE_HOME: str = "/opt/insightface"
    DB_POOL_MIN: int = 1
    DB_POOL_MAX: int = 5
    ENV: str = "development"

    @field_validator("JWT_SECRET")
    @classmethod
    def validate_jwt_secret(cls, v: str) -> str:
        if len(v.encode("utf-8")) < 32:
            raise ValueError("JWT_SECRET must be at least 32 bytes")
        return v

@lru_cache
def get_settings() -> Settings:
    return Settings()

settings = get_settings()
