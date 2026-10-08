from datetime import datetime
import json
import ssl
from typing import Any, List, Optional, Tuple
from urllib.parse import parse_qs, urlparse, urlunparse
from uuid import UUID
import asyncpg

_pool: Optional[asyncpg.Pool] = None

def parse_db_url(url: str) -> Tuple[str, Optional[Any]]:
    parsed = urlparse(url)
    query_params = parse_qs(parsed.query)
    ssl_context = None
    if "sslmode" in query_params:
        mode = query_params["sslmode"][0]
        if mode in ("require", "verify-ca", "verify-full"):
            ctx = ssl.create_default_context()
            ctx.check_hostname = False
            ctx.verify_mode = ssl.CERT_NONE
            ssl_context = ctx
        query_params.pop("sslmode", None)
    new_query = "&".join(f"{k}={v[0]}" for k, v in query_params.items())
    clean_url = urlunparse((
        parsed.scheme,
        parsed.netloc,
        parsed.path,
        parsed.params,
        new_query,
        parsed.fragment
    ))
    return clean_url, ssl_context

async def init_connection(conn: asyncpg.Connection) -> None:
    try:
        from pgvector.asyncpg import register_vector
        await register_vector(conn)
    except Exception:
        pass

async def init_pool(dsn: str, min_size: int = 1, max_size: int = 5) -> None:
    global _pool
    clean_url, ssl_ctx = parse_db_url(dsn)
    kwargs: dict[str, Any] = {
        "min_size": min_size,
        "max_size": max_size,
        "init": init_connection,
    }
    if ssl_ctx is not None:
        kwargs["ssl"] = ssl_ctx
    _pool = await asyncpg.create_pool(clean_url, **kwargs)

async def close_pool() -> None:
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None

def get_pool() -> asyncpg.Pool:
    if _pool is None:
        raise RuntimeError("Database pool is not initialized")
    return _pool

async def check_db_ready() -> bool:
    try:
        pool = get_pool()
        async with pool.acquire() as conn:
            val = await conn.fetchval("SELECT 1", timeout=2.0)
            return val == 1
    except Exception:
        return False

def vector_to_str(vec: List[float]) -> str:
    return "[" + ",".join(f"{x:.6f}" for x in vec) + "]"

async def get_user_by_email(email: str) -> Optional[dict]:
    pool = get_pool()
    row = await pool.fetchrow(
        "SELECT id, email, full_name, password_hash, role, is_active, created_at, last_login_at FROM users WHERE email = $1",
        email.strip().lower(),
    )
    return dict(row) if row else None

async def get_user_by_id(user_id: UUID) -> Optional[dict]:
    pool = get_pool()
    row = await pool.fetchrow(
        "SELECT id, email, full_name, password_hash, role, is_active, created_at, last_login_at FROM users WHERE id = $1",
        user_id,
    )
    return dict(row) if row else None

async def create_user(email: str, full_name: str, password_hash: str, role: str = "teacher") -> dict:
    pool = get_pool()
    row = await pool.fetchrow(
        """
        INSERT INTO users (email, full_name, password_hash, role)
        VALUES ($1, $2, $3, $4::user_role)
        RETURNING id, email, full_name, role, is_active, created_at
        """,
        email.strip().lower(),
        full_name.strip(),
        password_hash,
        role,
    )
    return dict(row)

async def update_user_last_login(user_id: UUID) -> None:
    pool = get_pool()
    await pool.execute(
        "UPDATE users SET last_login_at = now() WHERE id = $1",
        user_id,
    )

async def create_refresh_token(
    user_id: UUID,
    family_id: UUID,
    token_hash: str,
    expires_at: datetime,
    user_agent: Optional[str] = None,
) -> None:
    pool = get_pool()
    await pool.execute(
        """
        INSERT INTO refresh_tokens (user_id, family_id, token_hash, expires_at, user_agent)
        VALUES ($1, $2, $3, $4, $5)
        """,
        user_id,
        family_id,
        token_hash,
        expires_at,
        user_agent,
    )

async def get_refresh_token(token_hash: str) -> Optional[dict]:
    pool = get_pool()
    row = await pool.fetchrow(
        "SELECT id, user_id, family_id, token_hash, expires_at, revoked_at, user_agent FROM refresh_tokens WHERE token_hash = $1",
        token_hash,
    )
    return dict(row) if row else None

async def revoke_refresh_token(token_hash: str) -> None:
    pool = get_pool()
    await pool.execute(
        "UPDATE refresh_tokens SET revoked_at = now() WHERE token_hash = $1",
        token_hash,
    )

async def revoke_refresh_token_family(family_id: UUID) -> None:
    pool = get_pool()
    await pool.execute(
        "UPDATE refresh_tokens SET revoked_at = now() WHERE family_id = $1 AND revoked_at IS NULL",
        family_id,
    )

async def find_nearest_duplicate_face(vector_str: str, threshold: float) -> Optional[dict]:
    pool = get_pool()
    row = await pool.fetchrow(
        """
        SELECT s.id, s.usn, s.full_name, (e.embedding <=> $1::vector) AS distance
        FROM student_embeddings e
        JOIN students s ON s.id = e.student_id
        WHERE (e.embedding <=> $1::vector) < $2
        ORDER BY e.embedding <=> $1::vector
        LIMIT 1
        """,
        vector_str,
        threshold,
    )
    return dict(row) if row else None

async def register_student_with_embeddings(
    usn: str,
    full_name: str,
    thumbnail: str,
    created_by: UUID,
    vector_strs: List[str],
) -> dict:
    pool = get_pool()
    async with pool.acquire() as conn:
        async with conn.transaction():
            student_row = await conn.fetchrow(
                """
                INSERT INTO students (usn, full_name, thumbnail, created_by)
                VALUES ($1, $2, $3, $4)
                RETURNING id, usn, full_name
                """,
                usn,
                full_name,
                thumbnail,
                created_by,
            )
            student_id = student_row["id"]
            for vec_str in vector_strs:
                await conn.execute(
                    """
                    INSERT INTO student_embeddings (student_id, embedding)
                    VALUES ($1, $2::vector)
                    """,
                    student_id,
                    vec_str,
                )
            return dict(student_row)

async def get_student_by_usn(usn: str) -> Optional[dict]:
    pool = get_pool()
    row = await pool.fetchrow(
        "SELECT id, usn, full_name, thumbnail, created_at FROM students WHERE usn = $1",
        usn.upper(),
    )
    return dict(row) if row else None

async def list_students(
    search: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
) -> Tuple[int, List[dict]]:
    pool = get_pool()
    search_pattern = f"%{search.strip()}%" if search and search.strip() else None
    count_row = await pool.fetchrow(
        """
        SELECT count(*)::int AS total
        FROM students
        WHERE ($1::text IS NULL OR usn ILIKE $1 OR full_name ILIKE $1)
        """,
        search_pattern,
    )
    total = count_row["total"] if count_row else 0
    rows = await pool.fetch(
        """
        SELECT usn, full_name, thumbnail
        FROM students
        WHERE ($1::text IS NULL OR usn ILIKE $1 OR full_name ILIKE $1)
        ORDER BY created_at DESC
        LIMIT $2 OFFSET $3
        """,
        search_pattern,
        limit,
        offset,
    )
    return total, [dict(r) for r in rows]

async def delete_student(usn: str) -> bool:
    pool = get_pool()
    row = await pool.fetchrow(
        "DELETE FROM students WHERE usn = $1 RETURNING id",
        usn.upper(),
    )
    return row is not None

async def create_session(subject_name: str, subject_code: str, created_by: UUID) -> dict:
    pool = get_pool()
    row = await pool.fetchrow(
        """
        INSERT INTO attendance_sessions (subject_name, subject_code, created_by)
        VALUES ($1, $2, $3)
        RETURNING id, subject_name, subject_code, session_date, is_active
        """,
        subject_name.strip(),
        subject_code.strip(),
        created_by,
    )
    return dict(row)

async def get_session_by_id(session_id: UUID) -> Optional[dict]:
    pool = get_pool()
    row = await pool.fetchrow(
        "SELECT id, subject_name, subject_code, session_date, started_at, ended_at, is_active, created_by FROM attendance_sessions WHERE id = $1",
        session_id,
    )
    return dict(row) if row else None

async def list_sessions(
    user_id: UUID,
    is_admin: bool,
    active: Optional[bool] = None,
    limit: int = 20,
    offset: int = 0,
) -> List[dict]:
    pool = get_pool()
    rows = await pool.fetch(
        """
        SELECT s.id, s.subject_name, s.subject_code, s.session_date, s.started_at, s.ended_at, s.is_active,
               COUNT(r.id)::int AS total_present
        FROM attendance_sessions s
        LEFT JOIN attendance_records r ON r.session_id = s.id
        WHERE ($1::boolean OR s.created_by = $2)
          AND ($3::boolean IS NULL OR s.is_active = $3)
        GROUP BY s.id
        ORDER BY s.started_at DESC
        LIMIT $4 OFFSET $5
        """,
        is_admin,
        user_id,
        active,
        limit,
        offset,
    )
    return [dict(r) for r in rows]

async def end_session(session_id: UUID) -> Optional[dict]:
    pool = get_pool()
    row = await pool.fetchrow(
        """
        UPDATE attendance_sessions
        SET is_active = FALSE, ended_at = now()
        WHERE id = $1
        RETURNING id, subject_name, subject_code, session_date, started_at, ended_at, is_active
        """,
        session_id,
    )
    return dict(row) if row else None

async def find_nearest_student_face(vector_str: str) -> Optional[dict]:
    pool = get_pool()
    row = await pool.fetchrow(
        """
        SELECT s.id, s.usn, s.full_name, s.thumbnail,
               (e.embedding <=> $1::vector) AS distance
        FROM student_embeddings e
        JOIN students s ON s.id = e.student_id
        ORDER BY e.embedding <=> $1::vector
        LIMIT 1
        """,
        vector_str,
    )
    return dict(row) if row else None

async def mark_face_attendance(
    session_id: UUID,
    student_id: UUID,
    distance: float,
    marked_by: UUID,
) -> Tuple[bool, datetime]:
    pool = get_pool()
    row = await pool.fetchrow(
        """
        INSERT INTO attendance_records (session_id, student_id, method, distance, marked_by)
        VALUES ($1, $2, 'face', $3, $4)
        ON CONFLICT (session_id, student_id) DO NOTHING
        RETURNING marked_at
        """,
        session_id,
        student_id,
        distance,
        marked_by,
    )
    if row:
        return True, row["marked_at"]
    existing = await pool.fetchrow(
        "SELECT marked_at FROM attendance_records WHERE session_id = $1 AND student_id = $2",
        session_id,
        student_id,
    )
    return False, existing["marked_at"]

async def mark_manual_attendance(
    session_id: UUID,
    student_id: UUID,
    marked_by: UUID,
) -> bool:
    pool = get_pool()
    row = await pool.fetchrow(
        """
        INSERT INTO attendance_records (session_id, student_id, method, distance, marked_by)
        VALUES ($1, $2, 'manual', NULL, $3)
        ON CONFLICT (session_id, student_id) DO NOTHING
        RETURNING id
        """,
        session_id,
        student_id,
        marked_by,
    )
    return row is not None

async def delete_attendance_record_by_usn(session_id: UUID, usn: str) -> bool:
    pool = get_pool()
    student = await get_student_by_usn(usn)
    if not student:
        return False
    row = await pool.fetchrow(
        "DELETE FROM attendance_records WHERE session_id = $1 AND student_id = $2 RETURNING id",
        session_id,
        student["id"],
    )
    return row is not None

async def get_session_dashboard(session_id: UUID) -> Optional[dict]:
    session = await get_session_by_id(session_id)
    if not session:
        return None
    pool = get_pool()
    enrolled_row = await pool.fetchrow("SELECT count(*)::int AS total FROM students")
    total_enrolled = enrolled_row["total"] if enrolled_row else 0
    attendee_rows = await pool.fetch(
        """
        SELECT s.usn, s.full_name, s.thumbnail, r.marked_at, r.method
        FROM attendance_records r
        JOIN students s ON s.id = r.student_id
        WHERE r.session_id = $1
        ORDER BY r.marked_at ASC
        """,
        session_id,
    )
    attendees = [
        {
            "usn": r["usn"],
            "full_name": r["full_name"],
            "thumbnail": r["thumbnail"],
            "marked_at": r["marked_at"].isoformat(),
            "method": r["method"],
        }
        for r in attendee_rows
    ]
    return {
        "status": "SUCCESS",
        "session_id": str(session["id"]),
        "subject_name": session["subject_name"],
        "subject_code": session["subject_code"],
        "session_date": str(session["session_date"]),
        "is_active": session["is_active"],
        "total_present": len(attendees),
        "total_enrolled": total_enrolled,
        "attendees": attendees,
    }

async def get_session_export_records(session_id: UUID) -> List[dict]:
    pool = get_pool()
    rows = await pool.fetch(
        """
        SELECT s.usn, s.full_name,
               (r.marked_at AT TIME ZONE 'Asia/Kolkata') AS marked_at_ist,
               r.method
        FROM attendance_records r
        JOIN students s ON s.id = r.student_id
        WHERE r.session_id = $1
        ORDER BY r.marked_at ASC
        """,
        session_id,
    )
    return [
        {
            "usn": r["usn"],
            "full_name": r["full_name"],
            "marked_at_ist": r["marked_at_ist"].strftime("%Y-%m-%d %H:%M:%S") if r["marked_at_ist"] else "",
            "method": r["method"],
        }
        for r in rows
    ]
