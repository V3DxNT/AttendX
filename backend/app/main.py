from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from prometheus_fastapi_instrumentator import Instrumentator
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.config import settings
from app.database import close_pool, init_pool
from app.errors import (
    AppError,
    app_error_handler,
    general_exception_handler,
    http_exception_handler,
    validation_error_handler,
)
from app.face_service import init_face_model, shutdown_face_service
from app.routers import auth, health, sessions, students
from app.security import bootstrap_admin

@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_pool(settings.DATABASE_URL, settings.DB_POOL_MIN, settings.DB_POOL_MAX)
    try:
        await bootstrap_admin()
    except Exception:
        pass
    init_face_model()
    yield
    await close_pool()
    shutdown_face_service()

docs_url = None if settings.ENV == "production" else "/docs"
redoc_url = None if settings.ENV == "production" else "/redoc"

app = FastAPI(
    title="AttendX API",
    lifespan=lifespan,
    docs_url=docs_url,
    redoc_url=redoc_url,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.FRONTEND_URL],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.middleware("http")
async def csrf_middleware(request: Request, call_next):
    if request.method in ("POST", "PUT", "PATCH", "DELETE"):
        if request.headers.get("x-requested-with") != "AttendX":
            return JSONResponse(
                status_code=403,
                content={
                    "status": "ERROR",
                    "code": "CSRF_HEADER_MISSING",
                    "message": "Missing or invalid X-Requested-With header",
                },
            )
    return await call_next(request)

app.add_exception_handler(AppError, app_error_handler)
app.add_exception_handler(RequestValidationError, validation_error_handler)
app.add_exception_handler(StarletteHTTPException, http_exception_handler)
app.add_exception_handler(Exception, general_exception_handler)

Instrumentator().instrument(app).expose(app, endpoint="/metrics", include_in_schema=False)

app.include_router(health.router)

api_v1_prefix = "/api/v1"
app.include_router(auth.router, prefix=api_v1_prefix)
app.include_router(students.router, prefix=api_v1_prefix)
app.include_router(sessions.router, prefix=api_v1_prefix)
