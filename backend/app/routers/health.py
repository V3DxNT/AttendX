from fastapi import APIRouter, Response, status
from fastapi.responses import JSONResponse

from app.database import check_db_ready
from app.face_service import is_model_loaded

router = APIRouter(tags=["health"])

@router.get("/health")
async def liveness():
    return {"status": "healthy"}

@router.get("/ready")
async def readiness():
    model_ok = is_model_loaded()
    db_ok = await check_db_ready()

    if model_ok and db_ok:
        return {"status": "ready"}

    return JSONResponse(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        content={
            "status": "ERROR",
            "code": "SERVICE_UNAVAILABLE",
            "message": "Service is not ready",
            "data": {
                "model_loaded": model_ok,
                "database_connected": db_ok,
            },
        },
    )
