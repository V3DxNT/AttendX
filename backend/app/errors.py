from typing import Any, Optional
from fastapi import Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

class AppError(Exception):
    def __init__(
        self,
        code: str,
        message: str,
        status_code: int = 400,
        data: Optional[dict[str, Any]] = None,
    ):
        self.code = code
        self.message = message
        self.status_code = status_code
        self.data = data
        super().__init__(message)

async def app_error_handler(request: Request, exc: AppError) -> JSONResponse:
    content: dict[str, Any] = {
        "status": "ERROR",
        "code": exc.code,
        "message": exc.message,
    }
    if exc.data is not None:
        content["data"] = exc.data
    return JSONResponse(status_code=exc.status_code, content=content)

async def validation_error_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
    return JSONResponse(
        status_code=422,
        content={
            "status": "ERROR",
            "code": "VALIDATION_ERROR",
            "message": "Validation failed",
            "data": {"details": exc.errors()},
        },
    )

async def http_exception_handler(request: Request, exc: StarletteHTTPException) -> JSONResponse:
    code = "HTTP_ERROR"
    if exc.status_code == 404:
        code = "NOT_FOUND"
    elif exc.status_code == 403:
        code = "FORBIDDEN"
    elif exc.status_code == 401:
        code = "UNAUTHORIZED"
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "status": "ERROR",
            "code": code,
            "message": str(exc.detail),
        },
    )

async def general_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    return JSONResponse(
        status_code=500,
        content={
            "status": "ERROR",
            "code": "INTERNAL_SERVER_ERROR",
            "message": "An unexpected error occurred",
        },
    )
