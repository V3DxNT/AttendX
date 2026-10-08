from typing import Optional
from fastapi import APIRouter, Depends, Query, status

from app.config import settings
from app.database import (
    delete_student,
    find_nearest_duplicate_face,
    get_student_by_usn,
    list_students,
    register_student_with_embeddings,
    vector_to_str,
)
from app.errors import AppError
from app.face_service import process_face_image
from app.schemas import StudentRegisterRequest
from app.security import get_current_user, require_role

router = APIRouter(prefix="/students", tags=["students"])

@router.post("/register", status_code=status.HTTP_201_CREATED)
async def register_student(
    body: StudentRegisterRequest,
    current_user: dict = Depends(get_current_user),
):
    usn = body.usn
    full_name = body.full_name.strip()

    existing = await get_student_by_usn(usn)
    if existing:
        raise AppError(
            code="USN_EXISTS",
            message=f"Student with USN {usn} already exists",
            status_code=409,
        )

    primary_embedding, thumbnail = await process_face_image(body.image_base64)

    nearest = await find_nearest_duplicate_face(
        vector_to_str(primary_embedding), settings.DUPLICATE_THRESHOLD
    )
    if nearest and nearest["usn"].upper() != usn:
        raise AppError(
            code="FACE_ALREADY_ENROLLED",
            message=f"Face is already enrolled under USN {nearest['usn']}",
            status_code=409,
            data={"usn": nearest["usn"]},
        )

    all_embeddings = [primary_embedding]

    if body.extra_images_base64:
        for extra_b64 in body.extra_images_base64[:2]:
            extra_emb, _ = await process_face_image(extra_b64)
            all_embeddings.append(extra_emb)

    vector_strs = [vector_to_str(emb) for emb in all_embeddings]

    await register_student_with_embeddings(
        usn=usn,
        full_name=full_name,
        thumbnail=thumbnail,
        created_by=current_user["id"],
        vector_strs=vector_strs,
    )

    return {
        "status": "SUCCESS",
        "message": "Student registered successfully",
        "data": {
            "usn": usn,
            "full_name": full_name,
            "embeddings_stored": len(all_embeddings),
        },
    }

@router.get("")
async def get_students(
    search: Optional[str] = Query(default=None),
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    current_user: dict = Depends(get_current_user),
):
    total, items = await list_students(search=search, limit=limit, offset=offset)
    return {
        "status": "SUCCESS",
        "total": total,
        "items": items,
    }

@router.get("/{usn}")
async def get_student(
    usn: str,
    current_user: dict = Depends(get_current_user),
):
    student = await get_student_by_usn(usn)
    if not student:
        raise AppError(
            code="STUDENT_NOT_FOUND",
            message=f"Student {usn.upper()} not found",
            status_code=404,
        )
    return {
        "status": "SUCCESS",
        "student": {
            "usn": student["usn"],
            "full_name": student["full_name"],
            "thumbnail": student["thumbnail"],
            "created_at": student["created_at"].isoformat() if student.get("created_at") else None,
        },
    }

@router.delete("/{usn}")
async def remove_student(
    usn: str,
    admin_user: dict = Depends(require_role("admin")),
):
    deleted = await delete_student(usn)
    if not deleted:
        raise AppError(
            code="STUDENT_NOT_FOUND",
            message=f"Student {usn.upper()} not found",
            status_code=404,
        )
    return {
        "status": "SUCCESS",
        "message": f"Student {usn.upper()} deleted successfully",
    }
