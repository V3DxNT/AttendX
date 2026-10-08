import csv
import io
from typing import Optional
from uuid import UUID
from fastapi import APIRouter, Depends, Query, Response, status

from app.config import settings
from app.database import (
    create_session,
    delete_attendance_record_by_usn,
    end_session,
    find_nearest_student_face,
    get_session_by_id,
    get_session_dashboard,
    get_session_export_records,
    get_student_by_usn,
    list_sessions,
    mark_face_attendance,
    mark_manual_attendance,
    vector_to_str,
)
from app.errors import AppError
from app.face_service import process_face_image
from app.metrics import match_total_counter
from app.schemas import (
    SessionCreateRequest,
    SessionManualRecordRequest,
    SessionMarkRequest,
)
from app.security import get_current_user

router = APIRouter(prefix="/sessions", tags=["sessions"])

def sanitize_csv_cell(val: str) -> str:
    s = str(val or "")
    if s and s[0] in ("=", "+", "-", "@"):
        return "'" + s
    return s

async def get_authorized_session(session_id_str: str, current_user: dict) -> dict:
    try:
        session_id = UUID(session_id_str)
    except ValueError:
        raise AppError(
            code="SESSION_NOT_FOUND",
            message="Invalid session ID format",
            status_code=404,
        )

    session = await get_session_by_id(session_id)
    if not session:
        raise AppError(
            code="SESSION_NOT_FOUND",
            message="Session not found",
            status_code=404,
        )

    is_admin = current_user.get("role") == "admin"
    is_owner = session.get("created_by") == current_user.get("id")

    if not is_admin and not is_owner:
        raise AppError(
            code="SESSION_NOT_FOUND",
            message="Session not found",
            status_code=404,
        )

    return session

@router.post("/create", status_code=status.HTTP_201_CREATED)
async def create_new_session(
    body: SessionCreateRequest,
    current_user: dict = Depends(get_current_user),
):
    session = await create_session(
        subject_name=body.subject_name,
        subject_code=body.subject_code,
        created_by=current_user["id"],
    )
    return {
        "status": "SUCCESS",
        "session_id": str(session["id"]),
        "subject_name": session["subject_name"],
        "subject_code": session["subject_code"],
        "session_date": str(session["session_date"]),
        "is_active": session["is_active"],
    }

@router.get("")
async def get_sessions(
    active: Optional[bool] = Query(default=None),
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    current_user: dict = Depends(get_current_user),
):
    is_admin = current_user.get("role") == "admin"
    sessions = await list_sessions(
        user_id=current_user["id"],
        is_admin=is_admin,
        active=active,
        limit=limit,
        offset=offset,
    )
    formatted = [
        {
            "id": str(s["id"]),
            "subject_name": s["subject_name"],
            "subject_code": s["subject_code"],
            "session_date": str(s["session_date"]),
            "started_at": s["started_at"].isoformat() if s.get("started_at") else None,
            "ended_at": s["ended_at"].isoformat() if s.get("ended_at") else None,
            "is_active": s["is_active"],
            "total_present": s["total_present"],
        }
        for s in sessions
    ]
    return {
        "status": "SUCCESS",
        "total": len(formatted),
        "items": formatted,
    }

@router.post("/{session_id}/end")
async def end_active_session(
    session_id: str,
    current_user: dict = Depends(get_current_user),
):
    session = await get_authorized_session(session_id, current_user)
    updated = await end_session(session["id"])
    return {
        "status": "SUCCESS",
        "message": "Session ended successfully",
        "session": {
            "id": str(updated["id"]),
            "subject_name": updated["subject_name"],
            "subject_code": updated["subject_code"],
            "is_active": updated["is_active"],
            "ended_at": updated["ended_at"].isoformat() if updated.get("ended_at") else None,
        },
    }

@router.post("/{session_id}/mark")
async def mark_session_attendance(
    session_id: str,
    body: SessionMarkRequest,
    current_user: dict = Depends(get_current_user),
):
    session = await get_authorized_session(session_id, current_user)
    if not session.get("is_active"):
        raise AppError(
            code="SESSION_ENDED",
            message="Attendance session is closed",
            status_code=409,
        )

    live_embedding, _ = await process_face_image(body.image_base64)
    nearest = await find_nearest_student_face(vector_to_str(live_embedding))

    if not nearest or float(nearest["distance"]) > settings.MATCH_THRESHOLD:
        match_total_counter.labels(outcome="unknown").inc()
        raise AppError(
            code="UNKNOWN_FACE",
            message="Face not recognized or match distance exceeded threshold",
            status_code=404,
        )

    inserted, marked_at = await mark_face_attendance(
        session_id=session["id"],
        student_id=nearest["id"],
        distance=float(nearest["distance"]),
        marked_by=current_user["id"],
    )

    if not inserted:
        match_total_counter.labels(outcome="already_marked").inc()
        raise AppError(
            code="ALREADY_MARKED",
            message=f"Attendance already marked for student {nearest['usn']}",
            status_code=409,
            data={
                "student": {
                    "usn": nearest["usn"],
                    "full_name": nearest["full_name"],
                    "thumbnail": nearest["thumbnail"],
                    "marked_at": marked_at.isoformat() if marked_at else None,
                }
            },
        )

    match_total_counter.labels(outcome="matched").inc()
    return {
        "status": "SUCCESS",
        "student": {
            "usn": nearest["usn"],
            "full_name": nearest["full_name"],
            "thumbnail": nearest["thumbnail"],
            "marked_at": marked_at.isoformat() if marked_at else None,
        },
        "distance": round(float(nearest["distance"]), 4),
    }

@router.get("/{session_id}/dashboard")
async def session_dashboard(
    session_id: str,
    current_user: dict = Depends(get_current_user),
):
    session = await get_authorized_session(session_id, current_user)
    dashboard_data = await get_session_dashboard(session["id"])
    return dashboard_data

@router.post("/{session_id}/records")
async def add_manual_record(
    session_id: str,
    body: SessionManualRecordRequest,
    current_user: dict = Depends(get_current_user),
):
    session = await get_authorized_session(session_id, current_user)
    if not session.get("is_active"):
        raise AppError(
            code="SESSION_ENDED",
            message="Cannot add records to an ended session",
            status_code=409,
        )

    student = await get_student_by_usn(body.usn)
    if not student:
        raise AppError(
            code="STUDENT_NOT_FOUND",
            message=f"Student {body.usn} not found",
            status_code=404,
        )

    inserted = await mark_manual_attendance(
        session_id=session["id"],
        student_id=student["id"],
        marked_by=current_user["id"],
    )

    if not inserted:
        raise AppError(
            code="ALREADY_MARKED",
            message=f"Attendance already marked for student {student['usn']}",
            status_code=409,
        )

    return {
        "status": "SUCCESS",
        "message": f"Attendance recorded manually for {student['usn']}",
    }

@router.delete("/{session_id}/records/{usn}")
async def remove_record(
    session_id: str,
    usn: str,
    current_user: dict = Depends(get_current_user),
):
    session = await get_authorized_session(session_id, current_user)
    deleted = await delete_attendance_record_by_usn(session["id"], usn)
    if not deleted:
        raise AppError(
            code="RECORD_NOT_FOUND",
            message=f"Attendance record for {usn.upper()} not found in this session",
            status_code=404,
        )
    return {
        "status": "SUCCESS",
        "message": f"Attendance record for {usn.upper()} deleted successfully",
    }

@router.get("/{session_id}/export.csv")
async def export_session_csv(
    session_id: str,
    current_user: dict = Depends(get_current_user),
):
    session = await get_authorized_session(session_id, current_user)
    records = await get_session_export_records(session["id"])

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["usn", "full_name", "marked_at_ist", "method"])

    for r in records:
        writer.writerow([
            sanitize_csv_cell(r["usn"]),
            sanitize_csv_cell(r["full_name"]),
            sanitize_csv_cell(r["marked_at_ist"]),
            sanitize_csv_cell(r["method"]),
        ])

    csv_data = output.getvalue()
    filename = f"{session['subject_code']}_{session['session_date']}.csv"

    return Response(
        content=csv_data,
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
