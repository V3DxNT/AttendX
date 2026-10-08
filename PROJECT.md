# AttendX — Computer Vision Attendance System (DevOps Track)

**Audience:** an autonomous coding agent (Antigravity / Cursor / similar) implementing this repo from scratch.
**Human owner:** a CS student who must defend this project in a DevOps viva. Everything must be explainable.
**Read this whole file before writing any code.** Section 2 lists decisions that override anything you may assume. Section 16 gives the build order with acceptance checks. Do not skip checks.

---

* keep in mind

one thing strict from the Human Owner that, Terraform is an important
part in devops, but as for v1 of the application we shall do the hosting and
azure part manually, 
we shall then comeback later and then implement it in the v2 of the application
so for the coding agent, it needs to write the code for terraform too
but the implementation will be done later.
And dont add any comments in the entire code base



## 0. Hard Rules for the Agent

1. **Zero host installs.** Never instruct the user to install Python, Node, OpenCV, or PostgreSQL locally. Local dev runs entirely through `docker compose`. (Terraform, `az`, `kubectl` are the only CLI tools the user needs, and only for cloud steps.)
2. **No Helm** for the app, Prometheus, or Grafana. Raw Kubernetes manifests only, so the user can walk a professor through each primitive.
3. **Terraform** provisions Azure Resource Group, ACR, AKS, and the AcrPull role assignment. No `az aks create` snippets as the primary path.
4. **No model training.** Use `insightface` `buffalo_l` through `onnxruntime` (CPU).
5. **Raw SQL via `asyncpg`.** No ORM, no Alembic. Schema lives in `db/schema.sql`.
6. **Never commit real secrets.** `k8s/app/secret.example.yaml` is committed; the real Secret is created by CI from GitHub Secrets.
7. **Never use the `:latest` tag for deployments.** Tag images with the git SHA.
8. Every endpoint returns the error envelope in section 8.1. No bare 500 stack traces to clients.
9. Write a short `README.md` at the end (run locally, deploy, demo script). Keep this `PROJECT.md` in the repo root.

---

## 1. Product Overview

AttendX marks university attendance by face. A logged-in teacher starts a session for a subject, points a camera at one student at a time, and the backend identifies the student by comparing a 512-d face embedding against enrolled students using pgvector cosine distance. Attendance is recorded once per student per session.

### Features (final scope)

| # | Feature | Status |
|---|---------|--------|
| 1 | Signup / login / logout / refresh with **JWT in httpOnly cookies** | **NEW** |
| 2 | Roles: `admin`, `teacher` | **NEW** |
| 3 | Student enrollment (1 required photo, up to 2 optional extra photos) | extended |
| 4 | Duplicate-face guard at enrollment (same face under a different USN is rejected) | **NEW** |
| 5 | Student list / search / delete (delete = admin only, cascades) | extended |
| 6 | Create / end / list attendance sessions (owned by the creating teacher) | extended |
| 7 | Live face scan → mark attendance (single face only) | kept |
| 8 | Session dashboard (present list with thumbnails, counts) | kept |
| 9 | Manual add/remove of an attendance record (for failed scans) | **NEW** |
| 10 | CSV export of a session | **NEW** |
| 11 | Health, readiness, Prometheus metrics | extended |
| 12 | Terraform → AKS + ACR, GitHub Actions CI/CD, Prometheus + Grafana | kept |

### Explicitly out of scope (state these honestly in the README "Limitations")

- **No liveness / anti-spoofing.** A printed photo or a phone screen showing a student's face can mark them present. The original spec's heading said "Anti-Spoofing" but contained none; it has been renamed. Do not claim otherwise anywhere.
- Group scanning (multiple faces in one frame). Multiple faces are rejected by design.
- Student self-service accounts. Students are records, not users.

---

## 2. Decisions & Changes vs. the Original Spec (Read Carefully)

| Original | Problem | Decision |
|----------|---------|----------|
| Vercel (HTTPS) frontend calls AKS LoadBalancer (plain HTTP IP) | Browsers **block mixed content**. Cross-site cookies also break (needs `SameSite=None; Secure`, and Safari/Chrome increasingly block third-party cookies). | **Frontend proxies `/api/*` through Vercel rewrites** to the backend. Browser only talks to the Vercel origin → no mixed content, no CORS in production, cookies are first-party (`SameSite=Lax`). CORS middleware stays for local dev only. |
| Two parallel deploy paths (Docker Hub + `az aks create` CLI **and** ACR + Terraform) | Contradictory | **Terraform + ACR only.** Docker Hub removed. |
| `secret.yaml` with DB URL committed | Leaks credentials into git history | Commit `secret.example.yaml` only. CI runs `kubectl create secret ... --dry-run=client -o yaml \| kubectl apply -f -`. |
| `terraform apply` on every push | Slow, risky, and **fails on a stopped cluster** (`az aks stop` is part of the cost plan) | Terraform job runs only when `terraform/**` changes or on manual dispatch. Remote state in an Azure Storage account. |
| Supabase direct DB host | Free-tier direct connections are **IPv6-only**; AKS nodes are typically IPv4 | Use the **Supabase Session Pooler** connection string (IPv4, port 5432). See section 11. |
| `libgl1-mesa-glx` in Dockerfile | Package removed in newer Debian releases → build breaks | Pin `python:3.10-slim-bookworm` and install `libgl1`. |
| `:latest` + `rollout restart` | Not reproducible, not rollback-able | SHA tags + `kubectl rollout status`. |
| `/health` used for both liveness and readiness | A pod with a dead DB or unloaded model still looks "ready" | `/health` = liveness (process up). `/ready` = model loaded **and** DB reachable. |
| `attendance_records` stores only a timestamp | No audit trail of how/why a record exists | Add `method` (`face`/`manual`), `distance`, `marked_by`. |
| `session_date DEFAULT CURRENT_DATE` | DB runs UTC; India evening classes get the wrong date | Compute date in `Asia/Kolkata`. |
| Tables exposed in Supabase | Supabase auto-exposes `public` tables through its REST API using the anon key → anyone could read student data | **Enable RLS on every table with no policies.** The backend connects as `postgres` (bypasses RLS); the public REST API gets nothing. |
| Open signup | Anyone on the internet could register and read student faces | Signup requires a server-side `SIGNUP_INVITE_CODE`. |

---

## 3. Architecture

```
 Browser ──HTTPS──▶ Vercel (Next.js)
                      │  rewrites  /api/*  (server-side proxy, HTTP)
                      ▼
              Azure LoadBalancer (public IP)
                      │
        ┌─────────────┴──────────────── AKS (1× Standard_B2s) ─────────────┐
        │  ns: cv-attendance                                                │
        │   Deployment attendx-backend (FastAPI + InsightFace/ONNX CPU)     │
        │      /api/v1/*   /health   /ready   /metrics                      │
        │  ns: monitoring                                                   │
        │   Prometheus (scrapes app /metrics + kubelet cAdvisor)            │
        │   Grafana (LoadBalancer :3000)                                    │
        └───────────────────────────────┬───────────────────────────────────┘
                                        │ asyncpg (TLS)
                                        ▼
                     Supabase PostgreSQL + pgvector (Session Pooler)
```

Azure Container Registry holds images; AKS pulls via the kubelet identity's `AcrPull` role. GitHub Actions builds, pushes, and deploys.

---

## 4. Tech Stack

- **Backend:** Python 3.10, FastAPI, Uvicorn, Pydantic v2 + `pydantic-settings`, `asyncpg`, `pgvector` (python package, for asyncpg codec), `PyJWT`, `argon2-cffi`, `prometheus-fastapi-instrumentator`, `python-multipart`.
- **CV/ML:** `insightface` (`buffalo_l`, restricted to `detection` + `recognition` modules to save RAM/CPU), `onnxruntime` (CPU), `opencv-python-headless`, `numpy<2`.
- **DB:** Supabase PostgreSQL 15+ with `pgvector`, `citext`.
- **Containers:** Docker, Docker Compose (local), KinD optional.
- **IaC:** Terraform (`azurerm` ~> 3.x), remote state in Azure Storage.
- **Cloud:** AKS (Free control-plane tier, 1× `Standard_B2s`), ACR Basic.
- **Observability:** Prometheus + Grafana via raw manifests.
- **CI/CD:** GitHub Actions.
- **Dev tooling:** `ruff` (lint), `pytest` + `httpx` (tests).

Pin exact versions in `requirements.txt` after confirming they resolve together inside the Docker build (the build is the source of truth). The original pins (`fastapi==0.103.2`, `pydantic==2.4.2`, `numpy==1.26.0`, `onnxruntime==1.16.0`, `insightface==0.7.3`) are acceptable as a known-compatible baseline; newer FastAPI/Pydantic are fine if the build passes. Keep `numpy<2`.

---

## 5. Repository Structure (create exactly this)

```text
attendx/
├── PROJECT.md
├── README.md
├── docker-compose.yml
├── .gitignore
├── db/
│   └── schema.sql                    # run in Supabase SQL editor; also auto-loaded by local compose DB
├── backend/
│   ├── Dockerfile
│   ├── requirements.txt
│   ├── .dockerignore
│   ├── .env.example
│   ├── pyproject.toml                # ruff + pytest config
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py                   # app factory, lifespan, CORS, metrics, routers, exception handlers
│   │   ├── config.py                 # pydantic-settings
│   │   ├── database.py               # asyncpg pool + all raw SQL functions
│   │   ├── security.py               # hashing, JWT, cookies, auth dependencies
│   │   ├── face_service.py           # InsightFace load, detect, embed, thumbnail
│   │   ├── schemas.py                # Pydantic models + error envelope
│   │   ├── errors.py                 # AppError + handlers
│   │   ├── metrics.py                # custom Prometheus metrics
│   │   └── routers/
│   │       ├── auth.py
│   │       ├── students.py
│   │       ├── sessions.py
│   │       └── health.py
│   └── tests/
│       ├── test_security.py
│       ├── test_face_service.py
│       └── test_api_smoke.py
├── terraform/
│   ├── main.tf
│   ├── variables.tf
│   ├── outputs.tf
│   ├── versions.tf
│   └── terraform.tfvars.example
├── k8s/
│   ├── app/
│   │   ├── namespace.yaml
│   │   ├── configmap.yaml
│   │   ├── secret.example.yaml       # placeholders only
│   │   ├── deployment.yaml
│   │   └── service.yaml
│   └── monitoring/
│       ├── namespace.yaml
│       ├── prometheus.yaml
│       └── grafana.yaml
├── scripts/
│   └── bootstrap-tfstate.sh          # creates the Azure Storage account for Terraform state
└── .github/workflows/deploy.yml
```

Note: the frontend (Next.js) is a **separate repo**. Section 15 defines the contract it must follow. Do not generate the frontend in this repo unless explicitly asked.

---

## 6. Database Schema — `db/schema.sql`

Idempotent where practical. Execute in the Supabase SQL editor. The same file is mounted into the local Postgres container (`pgvector/pgvector:pg16`) by Compose.

```sql
-- ============ Extensions ============
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS citext;

-- ============ Auth ============
DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('admin', 'teacher');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS users (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email          CITEXT UNIQUE NOT NULL,
    full_name      VARCHAR(100) NOT NULL,
    password_hash  TEXT NOT NULL,                       -- argon2id
    role           user_role NOT NULL DEFAULT 'teacher',
    is_active      BOOLEAN NOT NULL DEFAULT TRUE,       -- soft-disable instead of deleting (keeps attendance history)
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_login_at  TIMESTAMPTZ
);

-- Refresh tokens: store only a SHA-256 hash. Rotation with reuse detection via family_id.
CREATE TABLE IF NOT EXISTS refresh_tokens (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    family_id   UUID NOT NULL,
    token_hash  CHAR(64) UNIQUE NOT NULL,
    expires_at  TIMESTAMPTZ NOT NULL,
    revoked_at  TIMESTAMPTZ,
    user_agent  TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_refresh_user   ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_family ON refresh_tokens(family_id);

-- ============ Students & face embeddings ============
CREATE TABLE IF NOT EXISTS students (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    usn         VARCHAR(20) UNIQUE NOT NULL CHECK (usn = upper(usn)),   -- e.g. 1MS21CS099 (store uppercase)
    full_name   VARCHAR(100) NOT NULL,
    thumbnail   TEXT NOT NULL,                                          -- data:image/webp;base64,... (96x96)
    created_by  UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- A student may have up to 3 embeddings (enforced in app) for robustness to angle/lighting.
CREATE TABLE IF NOT EXISTS student_embeddings (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id  UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    embedding   VECTOR(512) NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_embeddings_student ON student_embeddings(student_id);
CREATE INDEX IF NOT EXISTS idx_embeddings_hnsw
    ON student_embeddings USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);

-- ============ Attendance ============
CREATE TABLE IF NOT EXISTS attendance_sessions (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subject_name  VARCHAR(100) NOT NULL,
    subject_code  VARCHAR(20)  NOT NULL,
    session_date  DATE NOT NULL DEFAULT ((now() AT TIME ZONE 'Asia/Kolkata')::date),
    started_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    ended_at      TIMESTAMPTZ,
    is_active     BOOLEAN NOT NULL DEFAULT TRUE,
    created_by    UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS idx_sessions_owner ON attendance_sessions(created_by, started_at DESC);

CREATE TABLE IF NOT EXISTS attendance_records (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id  UUID NOT NULL REFERENCES attendance_sessions(id) ON DELETE CASCADE,
    student_id  UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    marked_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    method      TEXT NOT NULL DEFAULT 'face' CHECK (method IN ('face', 'manual')),
    distance    REAL,                                         -- cosine distance for face matches; NULL for manual
    marked_by   UUID REFERENCES users(id) ON DELETE SET NULL, -- teacher who operated the scan / override
    CONSTRAINT unique_student_session UNIQUE (session_id, student_id)
);
CREATE INDEX IF NOT EXISTS idx_records_session ON attendance_records(session_id);
CREATE INDEX IF NOT EXISTS idx_records_student ON attendance_records(student_id);

-- ============ Lock down Supabase's auto-generated public REST API ============
-- No policies are created, so anon/authenticated roles get nothing.
-- The backend connects as the `postgres` role, which bypasses RLS.
ALTER TABLE users               ENABLE ROW LEVEL SECURITY;
ALTER TABLE refresh_tokens      ENABLE ROW LEVEL SECURITY;
ALTER TABLE students            ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_embeddings  ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_records  ENABLE ROW LEVEL SECURITY;
```

Notes the agent must preserve in comments/README:
- Deleting a student cascades to embeddings and attendance records. This is intentional (right to erasure for biometric data) and must be mentioned in the README.
- HNSW is approximate and only pays off at large row counts. For a class of a few hundred students a sequential scan is exact and just as fast. The index stays because it is a deliberate learning/demo feature; keep `ORDER BY e.embedding <=> $1` written exactly as an expression so the planner *can* use it.

---

## 7. Authentication Design (JWT + Cookies)

### 7.1 Flow

- **Signup** `POST /api/v1/auth/signup` → validates invite code, email uniqueness, password strength → creates a `teacher` user → logs them in (sets cookies).
- **Login** `POST /api/v1/auth/login` → verifies argon2 hash → sets cookies.
- **Refresh** `POST /api/v1/auth/refresh` → rotates the refresh token.
- **Logout** `POST /api/v1/auth/logout` → revokes the refresh token family, clears cookies.
- **Me** `GET /api/v1/auth/me` → current user.

### 7.2 Tokens and cookies

| Token | Lifetime | Cookie name | Path | Contents |
|-------|----------|-------------|------|----------|
| Access JWT (HS256) | 15 min | `access_token` | `/` | `sub` (user id), `role`, `iat`, `exp`, `type=access` |
| Refresh token | 7 days | `refresh_token` | `/api/v1/auth` | Opaque 256-bit random string (NOT a JWT). Only `sha256(token)` stored in DB |

Cookie attributes: `HttpOnly`, `Secure` (driven by `COOKIE_SECURE`, true in prod, false in local compose), `SameSite=Lax`, no `Domain` attribute (host-only).

### 7.3 Rules

1. Password hashing: **argon2id** via `argon2-cffi`. Minimum 8 characters, max 128. Reject if password equals email.
2. Refresh rotation: each refresh revokes the presented token and issues a new one in the same `family_id`. If a **revoked** token is presented again → revoke the entire family and return 401 (`TOKEN_REUSE_DETECTED`).
3. `JWT_SECRET` must be ≥ 32 bytes; the app refuses to start otherwise.
4. Auth dependency `get_current_user` reads the `access_token` cookie, verifies signature/expiry/type, then **loads the user row** and rejects if `is_active = false`. `require_role("admin")` builds on it.
5. **CSRF:** because cookies are `SameSite=Lax` and traffic is same-origin via the Vercel proxy, additionally require header `X-Requested-With: AttendX` on every state-changing request (POST/PUT/PATCH/DELETE) except none; return 403 `CSRF_HEADER_MISSING` if absent. Implement as a global dependency/middleware.
6. Login brute-force protection: keep a small in-memory counter per `(ip, email)`; after 5 failures in 15 minutes return 429. State this is per-pod and resets on restart (acceptable for a single replica).
7. Use a generic error for bad credentials (`INVALID_CREDENTIALS`) — never reveal whether the email exists. Run a dummy hash verify when the user is not found to equalize timing.
8. Bootstrap admin: if `ADMIN_EMAIL` and `ADMIN_PASSWORD` env vars are set and no user with that email exists at startup, create an `admin`. Otherwise signup always yields `teacher`.
9. Trust `X-Forwarded-For` for client IP only (Vercel and the LoadBalancer set it); run Uvicorn with `--proxy-headers --forwarded-allow-ips="*"`.

### 7.4 Authorization matrix

| Action | admin | teacher |
|--------|:----:|:------:|
| Register student | ✅ | ✅ |
| List/search students | ✅ | ✅ |
| Delete student | ✅ | ❌ |
| Create session | ✅ | ✅ |
| View/mark/end/export **own** session | ✅ | ✅ |
| View/mark/end/export **others'** session | ✅ | ❌ (404, not 403, to avoid leaking existence) |

---

## 8. REST API

Prefix: `/api/v1`. All routes except `signup`, `login`, `refresh`, `/health`, `/ready`, `/metrics` require a valid access cookie.

### 8.1 Envelopes

Success: `{"status": "SUCCESS", ...}`
Error: `{"status": "ERROR", "code": "<MACHINE_CODE>", "message": "<human readable>", "data": {...optional}}`

Validation errors from Pydantic must be mapped into this envelope with `code: "VALIDATION_ERROR"` (HTTP 422).

### 8.2 Auth

| Route | Body | Success | Errors |
|-------|------|---------|--------|
| `POST /auth/signup` | `{email, full_name, password, invite_code}` | 201 + cookies + user | 403 `INVALID_INVITE_CODE`, 409 `EMAIL_EXISTS` |
| `POST /auth/login` | `{email, password}` | 200 + cookies + user | 401 `INVALID_CREDENTIALS`, 429 `TOO_MANY_ATTEMPTS`, 403 `ACCOUNT_DISABLED` |
| `POST /auth/refresh` | none (cookie) | 200 + new cookies | 401 `INVALID_REFRESH_TOKEN`, 401 `TOKEN_REUSE_DETECTED` |
| `POST /auth/logout` | none | 200, cookies cleared | — |
| `GET /auth/me` | — | 200 `{id,email,full_name,role}` | 401 `NOT_AUTHENTICATED` |

### 8.3 Students

**`POST /students/register`**
```json
{
  "usn": "1MS21CS099",
  "full_name": "Vedant Sharma",
  "image_base64": "data:image/jpeg;base64,...",
  "extra_images_base64": ["data:image/jpeg;base64,..."]
}
```
`extra_images_base64` is optional, max 2 items. Process:
1. Normalize USN to uppercase; validate `^[A-Z0-9]{6,20}$`.
2. For **each** image: decode → validate (section 9) → require exactly one face → extract normalized embedding.
3. Thumbnail is generated from the **primary** image only.
4. **Duplicate-face guard:** run the nearest-neighbour query for the primary embedding; if the nearest distance `< DUPLICATE_THRESHOLD` (default `0.30`) and the matched student has a different USN → 409 `FACE_ALREADY_ENROLLED` with `data: {usn: <existing usn>}`.
5. In **one transaction**: insert into `students`, insert all embeddings. USN conflict → 409 `USN_EXISTS`.
6. 201: `{"status":"SUCCESS","message":"Student registered successfully","data":{"usn","full_name","embeddings_stored"}}`

**`GET /students?search=&limit=50&offset=0`** → `{status, total, items:[{usn, full_name, thumbnail}]}`; `search` matches `usn` or `full_name` (case-insensitive, `ILIKE`, parameterized). `limit` max 100.

**`GET /students/{usn}`** → 200 / 404 `STUDENT_NOT_FOUND`.

**`DELETE /students/{usn}`** (admin only) → 200 `{"status":"SUCCESS","message":"Student 1MS21CS099 deleted successfully"}` / 404.

### 8.4 Sessions

**`POST /sessions/create`** body `{subject_name, subject_code}` → 201 `{status, session_id, subject_name, subject_code, session_date, is_active}`.

**`GET /sessions?active=&limit=20&offset=0`** → caller's sessions (admin: all), newest first, each with `total_present`.

**`POST /sessions/{session_id}/end`** → sets `is_active=false`, `ended_at=now()`. Idempotent.

**`POST /sessions/{session_id}/mark`** — live scanner. Body `{"image_base64": "..."}`.

Process:
1. Load session; 404 `SESSION_NOT_FOUND` if missing or not owned (unless admin); 409 `SESSION_ENDED` if inactive.
2. Validate image; exactly one face (section 9).
3. Extract the live embedding.
4. Query:
   ```sql
   SELECT s.id, s.usn, s.full_name, s.thumbnail,
          (e.embedding <=> $1) AS distance
   FROM student_embeddings e
   JOIN students s ON s.id = e.student_id
   ORDER BY e.embedding <=> $1
   LIMIT 1;
   ```
5. If no row or `distance > MATCH_THRESHOLD` (default `0.40`) → 404 `UNKNOWN_FACE`.
6. Insert into `attendance_records (session_id, student_id, method, distance, marked_by)` using `ON CONFLICT (session_id, student_id) DO NOTHING RETURNING marked_at`. If nothing returned → 409 `ALREADY_MARKED` **with** `data.student` populated (usn, full_name, thumbnail, original marked_at) so the UI can show "already marked" instead of a bare error.
7. 200:
   ```json
   {
     "status": "SUCCESS",
     "student": {"usn":"1MS21CS099","full_name":"Vedant Sharma","thumbnail":"data:image/webp;base64,...","marked_at":"2026-10-07T14:30:00Z"},
     "distance": 0.21
   }
   ```

**`GET /sessions/{session_id}/dashboard`**
```json
{
  "status": "SUCCESS",
  "session_id": "...", "subject_name": "...", "subject_code": "...",
  "session_date": "2026-10-07", "is_active": true,
  "total_present": 2, "total_enrolled": 60,
  "attendees": [{"usn","full_name","thumbnail","marked_at","method"}]
}
```

**`POST /sessions/{session_id}/records`** (manual add) body `{"usn": "1MS21CS099"}` → inserts with `method='manual'`, `distance=NULL`; 404 `STUDENT_NOT_FOUND`; 409 `ALREADY_MARKED`.

**`DELETE /sessions/{session_id}/records/{usn}`** → removes a record (e.g., wrong match); 404 if absent.

**`GET /sessions/{session_id}/export.csv`** → `text/csv`, `Content-Disposition: attachment; filename="<subject_code>_<date>.csv"`. Columns: `usn,full_name,marked_at_ist,method`. **Escape cells beginning with `=`, `+`, `-`, `@`** (CSV/formula injection) by prefixing `'`.

### 8.5 Ops endpoints (no auth)

- `GET /health` → `{"status":"healthy"}` (liveness; must not touch the DB).
- `GET /ready` → 200 `{"status":"ready"}` only if the InsightFace model is loaded **and** `SELECT 1` succeeds within 2 s; else 503.
- `GET /metrics` → Prometheus exposition.

---

## 9. Face Pipeline — `app/face_service.py`

### 9.1 Model loading
- Load once in the FastAPI `lifespan`, not per request:
  ```python
  FaceAnalysis(name="buffalo_l", root=settings.INSIGHTFACE_HOME,
               providers=["CPUExecutionProvider"],
               allowed_modules=["detection", "recognition"])
  app.prepare(ctx_id=-1, det_size=(640, 640))
  ```
  (`ctx_id=-1` = CPU.) Weights are baked into the image at build time (section 10) under `INSIGHTFACE_HOME=/opt/insightface`.
- Inference is CPU-bound and blocking. **Never call it directly on the event loop.** Wrap in `await asyncio.get_running_loop().run_in_executor(executor, ...)` with a `ThreadPoolExecutor(max_workers=2)` and an `asyncio.Semaphore(2)` so a burst of scans cannot OOM the pod (the pod limit is 1.5 GiB).

### 9.2 Image validation (before inference)
1. Strip the `data:image/...;base64,` prefix if present; reject other MIME types. Accept only jpeg/png/webp.
2. Reject if decoded size > `MAX_IMAGE_BYTES` (default 2 MB) → 413 `IMAGE_TOO_LARGE`.
3. `cv2.imdecode`; failure → 422 `INVALID_IMAGE`.
4. If the longest side > 1280 px, downscale proportionally before detection.

### 9.3 Detection rules
| Condition | HTTP | Code |
|-----------|------|------|
| 0 faces | 422 | `NO_FACE_DETECTED` |
| > 1 face | 409 | `MULTIPLE_FACES_DETECTED` |
| Face bbox shorter side < 80 px | 422 | `FACE_TOO_SMALL` |
| `det_score` < 0.60 | 422 | `LOW_QUALITY_FACE` |

Return `face.normed_embedding` (float32, L2-normalized, length 512) and the bbox.

### 9.4 Thumbnail
Crop bbox with 20% padding (clamped to image bounds), resize to **96×96**, encode WebP quality 60, return `data:image/webp;base64,<...>` (~2–3 KB). If OpenCV's WebP encoder is unavailable, fall back to JPEG quality 70 and the matching MIME in the data URI.

### 9.5 Threshold honesty
`0.40` cosine **distance** (≈ 0.60 cosine similarity) is a conservative starting point for ArcFace, favouring false rejects over false accepts. Both thresholds are env-configurable (`MATCH_THRESHOLD`, `DUPLICATE_THRESHOLD`). The README must include a short "tuning" note: enrol a few real people, record genuine vs. impostor distances from the `distance` field, and set the threshold between the two distributions.

### 9.6 Custom metrics (`app/metrics.py`)
- `attendx_embedding_seconds` Histogram (time inside detection+embedding).
- `attendx_match_total{outcome="matched|unknown|already_marked|no_face|multiple_faces"}` Counter.
- `attendx_inflight_inference` Gauge.

---

## 10. Backend Container

### 10.1 `backend/requirements.txt`
Baseline (adjust only if the build demands it):
```text
fastapi==0.103.2
uvicorn[standard]==0.23.2
pydantic==2.4.2
pydantic-settings==2.0.3
asyncpg==0.28.0
pgvector==0.2.5
numpy==1.26.0
opencv-python-headless==4.8.1.78
insightface==0.7.3
onnxruntime==1.16.0
python-multipart==0.0.6
PyJWT==2.8.0
argon2-cffi==23.1.0
prometheus-fastapi-instrumentator==6.1.1
# dev
pytest==7.4.3
httpx==0.25.2
ruff==0.1.9
```

### 10.2 `backend/Dockerfile`
```dockerfile
FROM python:3.10-slim-bookworm

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    INSIGHTFACE_HOME=/opt/insightface

# build-essential is required: insightface compiles a Cython extension.
RUN apt-get update && apt-get install -y --no-install-recommends \
        build-essential libgl1 libglib2.0-0 curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Bake model weights into the image so pods never download at startup.
RUN python -c "from insightface.app import FaceAnalysis; \
FaceAnalysis(name='buffalo_l', root='/opt/insightface', providers=['CPUExecutionProvider'], allowed_modules=['detection','recognition']).prepare(ctx_id=-1, det_size=(640,640))"

COPY app ./app

# Run as non-root
RUN useradd -r -u 10001 appuser && chown -R appuser /app /opt/insightface
USER 10001

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers", "--forwarded-allow-ips=*"]
```
Single worker only (the model is ~hundreds of MB; multiple workers would multiply RAM). Scale with replicas, not workers — but see section 12 (node has room for 1 replica).

`.dockerignore`: `.git`, `__pycache__`, `*.pyc`, `.env`, `tests`, `.pytest_cache`, `.ruff_cache`.

### 10.3 `backend/.env.example`
```dotenv
DATABASE_URL=postgresql://postgres.[PROJECT_REF]:[PASSWORD]@aws-0-[REGION].pooler.supabase.com:5432/postgres
JWT_SECRET=change-me-to-at-least-32-random-bytes
JWT_ACCESS_MINUTES=15
JWT_REFRESH_DAYS=7
COOKIE_SECURE=false
SIGNUP_INVITE_CODE=change-me
ADMIN_EMAIL=
ADMIN_PASSWORD=
FRONTEND_URL=http://localhost:3000
MATCH_THRESHOLD=0.40
DUPLICATE_THRESHOLD=0.30
MAX_IMAGE_BYTES=2097152
INSIGHTFACE_HOME=/opt/insightface
DB_POOL_MIN=1
DB_POOL_MAX=5
```
Use `pydantic-settings`. Fail fast with a clear message on missing/weak required values.

### 10.4 `docker-compose.yml` (local, zero-install)
- `db`: `pgvector/pgvector:pg16`, env `POSTGRES_PASSWORD=postgres`, volume mounting `./db/schema.sql:/docker-entrypoint-initdb.d/01-schema.sql:ro`, healthcheck `pg_isready`.

  The schema's RLS statements are harmless on vanilla Postgres. Ensure the schema runs cleanly on both targets; if any statement is Supabase-specific, guard it so local init does not fail.
- `backend`: builds `./backend`, `env_file: ./backend/.env`, overrides `DATABASE_URL=postgresql://postgres:postgres@db:5432/postgres` and `COOKIE_SECURE=false`, ports `8000:8000`, `depends_on: db: condition: service_healthy`, healthcheck hitting `/ready` (generous `start_period: 60s`).
- Optional `profiles: ["monitoring"]` services for Prometheus/Grafana are **not** required.

A teacher can then hit `http://localhost:8000/docs` (keep FastAPI's Swagger UI enabled locally; set `docs_url=None` when `ENV=production`).

---

## 11. Supabase Setup (instruct the user in README)

1. Create a project; note the region.
2. SQL Editor → paste and run `db/schema.sql`.
3. **Connection string:** Project Settings → Database → Connection pooling → **Session pooler**, port **5432**. Use this in `DATABASE_URL`. (The direct `db.<ref>.supabase.co` host is IPv6-only on the free tier and will not be reachable from AKS.) Keep `?sslmode=require` semantics: pass `ssl="require"` to `asyncpg.create_pool`.
4. If the user later switches to the Transaction pooler (port 6543), `asyncpg` must be created with `statement_cache_size=0`.
5. Register the pgvector codec on every connection: `init=lambda conn: register_vector(conn)`. If the codec import fails in the pooled environment, fall back to passing the vector as text (`'[0.1,0.2,...]'`) with `$1::vector`.
6. Do **not** put the Supabase `anon`/`service_role` keys anywhere in this project; the backend only needs the Postgres URL.

---

## 12. Terraform (`terraform/`)

### `versions.tf`
```hcl
terraform {
  required_version = ">= 1.5"
  required_providers {
    azurerm = { source = "hashicorp/azurerm", version = "~> 3.100" }
  }
  backend "azurerm" {
    # Values supplied with `terraform init -backend-config=...` (see scripts/bootstrap-tfstate.sh)
  }
}
provider "azurerm" {
  features {}
}
```

### `variables.tf`
```hcl
variable "location"       { type = string  default = "centralindia" }
variable "resource_group" { type = string  default = "attendx-rg" }
variable "aks_name"       { type = string  default = "attendx-aks" }
variable "dns_prefix"     { type = string  default = "attendx-aks" }
variable "acr_name" {
  type        = string
  description = "Globally unique, 5-50 chars, lowercase alphanumeric only"
}
variable "node_vm_size"   { type = string  default = "Standard_B2s" }
```

### `main.tf`
```hcl
resource "azurerm_resource_group" "rg" {
  name     = var.resource_group
  location = var.location
}

resource "azurerm_container_registry" "acr" {
  name                = var.acr_name
  resource_group_name = azurerm_resource_group.rg.name
  location            = azurerm_resource_group.rg.location
  sku                 = "Basic"
  admin_enabled       = false
}

resource "azurerm_kubernetes_cluster" "aks" {
  name                = var.aks_name
  location            = azurerm_resource_group.rg.location
  resource_group_name = azurerm_resource_group.rg.name
  dns_prefix          = var.dns_prefix
  sku_tier            = "Free"

  default_node_pool {
    name            = "default"
    vm_size         = var.node_vm_size   # Standard_B2s (2 vCPU / 4 GiB). Hardcoded single node.
    node_count      = 1
    os_disk_size_gb = 32
  }

  identity { type = "SystemAssigned" }

  network_profile {
    network_plugin = "kubenet"
    load_balancer_sku = "standard"
  }
}

resource "azurerm_role_assignment" "aks_acr_pull" {
  principal_id                     = azurerm_kubernetes_cluster.aks.kubelet_identity[0].object_id
  role_definition_name             = "AcrPull"
  scope                            = azurerm_container_registry.acr.id
  skip_service_principal_aad_check = true
}
```

### `outputs.tf`
Output: `resource_group`, `aks_name`, `acr_name`, `acr_login_server`, and a `get_credentials_cmd` string (`az aks get-credentials ...`).

### `scripts/bootstrap-tfstate.sh`
Creates a resource group `tfstate-rg`, a storage account (unique name), and container `tfstate` using `az` commands, then prints the `terraform init -backend-config=...` line. Must be idempotent.

### Student-credit caveats (put in README)
- **Azure for Students restricts regions and VM sizes via policy.** If `Standard_B2s` or `centralindia` fails, list allowed regions/sizes with `az vm list-skus` and adjust `location`. Do not silently change the VM family; tell the user.
- Cost sanity: B2s is roughly US$30/month always-on; each public LoadBalancer IP adds cost. Two LBs (app + Grafana) are used. **Run `az aks stop` when not demoing** and `az aks start` before. Document both in the README. A stopped cluster cannot accept `kubectl`/Terraform changes — start it first.
- The node has ~4 GiB RAM, of which AKS system pods consume a large share. The workload budget below is deliberately tight; do not raise limits without checking `kubectl top nodes`.

---

## 13. Kubernetes Manifests (raw YAML, no Helm)

All app manifests live in namespace `cv-attendance`; monitoring in `monitoring`.

### `k8s/app/namespace.yaml`
Namespace `cv-attendance`.

### `k8s/app/configmap.yaml`
```yaml
apiVersion: v1
kind: ConfigMap
metadata: { name: backend-config, namespace: cv-attendance }
data:
  ENV: "production"
  FRONTEND_URL: "https://your-frontend.vercel.app"
  MATCH_THRESHOLD: "0.40"
  DUPLICATE_THRESHOLD: "0.30"
  COOKIE_SECURE: "true"
  JWT_ACCESS_MINUTES: "15"
  JWT_REFRESH_DAYS: "7"
  INSIGHTFACE_HOME: "/opt/insightface"
```

### `k8s/app/secret.example.yaml` (placeholders only; never commit real values)
```yaml
apiVersion: v1
kind: Secret
metadata: { name: backend-secrets, namespace: cv-attendance }
type: Opaque
stringData:
  DATABASE_URL: "REPLACE_ME"
  JWT_SECRET: "REPLACE_ME"
  SIGNUP_INVITE_CODE: "REPLACE_ME"
  ADMIN_EMAIL: "REPLACE_ME"
  ADMIN_PASSWORD: "REPLACE_ME"
```
Add `k8s/app/secret.yaml` to `.gitignore`. CI creates the real secret (section 14).

### `k8s/app/deployment.yaml`
- `replicas: 1`; `strategy: RollingUpdate` with `maxSurge: 0`, `maxUnavailable: 1` (a second pod will not fit on one B2s node, so a surge pod would sit Pending forever; accept brief downtime on deploy — mention in README).
- Image: `__ACR_LOGIN_SERVER__/attendx-backend:__IMAGE_TAG__` (placeholders replaced by `envsubst` in CI).
- `envFrom`: configMapRef `backend-config`, secretRef `backend-secrets`.
- Pod annotations are NOT needed; Prometheus uses a static scrape target.
- Resources: requests `cpu: 250m, memory: 768Mi`; limits `cpu: 1000m, memory: 1536Mi`.
- Probes:
  - `startupProbe`: GET `/health`, `periodSeconds: 5`, `failureThreshold: 30` (model load).
  - `readinessProbe`: GET `/ready`, `periodSeconds: 10`, `timeoutSeconds: 3`.
  - `livenessProbe`: GET `/health`, `periodSeconds: 15`, `timeoutSeconds: 3`, `failureThreshold: 3`.
- `securityContext`: `runAsNonRoot: true`, `allowPrivilegeEscalation: false`.
- Label `app: attendx-backend`.

### `k8s/app/service.yaml`
Service `attendx-backend-service`, type `LoadBalancer`, port 80 → targetPort 8000, selector `app: attendx-backend`.

### `k8s/monitoring/namespace.yaml`
Namespace `monitoring`.

### `k8s/monitoring/prometheus.yaml`
Must contain, in one file:
1. `ServiceAccount`, `ClusterRole` (resources `nodes`, `nodes/proxy`, `nodes/metrics`, `pods`, `services`, `endpoints`: verbs `get, list, watch`; nonResourceURLs `/metrics`: `get`), `ClusterRoleBinding`.
2. `ConfigMap prometheus-config` with `prometheus.yml`:
   ```yaml
   global: { scrape_interval: 15s }
   scrape_configs:
     - job_name: attendx-backend
       metrics_path: /metrics
       static_configs:
         - targets: ["attendx-backend-service.cv-attendance.svc.cluster.local:80"]
     - job_name: kubelet-cadvisor        # per-pod CPU / memory
       scheme: https
       tls_config: { ca_file: /var/run/secrets/kubernetes.io/serviceaccount/ca.crt }
       bearer_token_file: /var/run/secrets/kubernetes.io/serviceaccount/token
       kubernetes_sd_configs: [{ role: node }]
       relabel_configs:
         - action: labelmap
           regex: __meta_kubernetes_node_label_(.+)
         - target_label: __address__
           replacement: kubernetes.default.svc:443
         - source_labels: [__meta_kubernetes_node_name]
           regex: (.+)
           target_label: __metrics_path__
           replacement: /api/v1/nodes/$1/proxy/metrics/cadvisor
   ```
3. `Deployment` (1 replica, `prom/prometheus` pinned tag, args `--config.file=...`, `--storage.tsdb.retention.time=24h`, `--storage.tsdb.path=/prometheus`), `emptyDir` for data (state is lost on restart — acceptable, note it), requests `cpu: 50m, memory: 200Mi`, limits `memory: 512Mi`.
4. `Service` type **ClusterIP** `prometheus` on 9090 (not public).

### `k8s/monitoring/grafana.yaml`
1. `ConfigMap grafana-datasources` provisioning a Prometheus datasource at `http://prometheus.monitoring.svc.cluster.local:9090`.
2. `ConfigMap grafana-dashboards-provider` + `ConfigMap grafana-dashboard-attendx` containing a dashboard JSON with panels:
   - Backend pod CPU: `rate(container_cpu_usage_seconds_total{namespace="cv-attendance",container="backend"}[1m])`
   - Backend pod memory: `container_memory_working_set_bytes{namespace="cv-attendance",container="backend"}`
   - Request rate and p95 latency from the instrumentator metrics (`http_requests_total`, `http_request_duration_seconds_bucket`)
   - `histogram_quantile(0.95, rate(attendx_embedding_seconds_bucket[5m]))`
   - `sum by (outcome) (increase(attendx_match_total[5m]))`
   - `attendx_inflight_inference`
3. `Secret grafana-admin` is **not** committed; CI creates it from `GRAFANA_ADMIN_PASSWORD`. Deployment reads `GF_SECURITY_ADMIN_PASSWORD` from it. Disable anonymous access.
4. `Deployment` (1 replica, pinned `grafana/grafana` tag, requests `cpu: 50m, memory: 128Mi`, limits `memory: 256Mi`), mounting the provisioning ConfigMaps.
5. `Service` type `LoadBalancer`, port 3000 → 3000.

---

## 14. CI/CD — `.github/workflows/deploy.yml`

Trigger: `push` to `main` and `workflow_dispatch`. Pull requests run only the `test` job.

Jobs (use `needs:` to chain):

1. **`test`** — checkout, set up Python 3.10, `pip install -r backend/requirements.txt`, `ruff check backend`, `pytest backend/tests` (tests that need the ML model or DB must be skippable; unit tests for security/validation must run without them).
2. **`changes`** — `dorny/paths-filter@v3` outputs `terraform: true|false` for `terraform/**`.
3. **`terraform`** — runs only if `changes.terraform == 'true'` or on manual dispatch. `azure/login@v2` (service-principal JSON in `AZURE_CREDENTIALS`), `hashicorp/setup-terraform@v3`, `terraform init -backend-config=...`, `terraform apply -auto-approve -var acr_name=${{ vars.ACR_NAME }}`.
4. **`build-and-deploy`** — `needs: [test, terraform]` with `if: always() && needs.test.result == 'success' && needs.terraform.result != 'failure'`:
   1. `azure/login@v2`.
   2. `az acr login --name ${{ vars.ACR_NAME }}`.
   3. `docker/build-push-action@v5`: context `./backend`, tags `${{ vars.ACR_NAME }}.azurecr.io/attendx-backend:${{ github.sha }}`, GHA layer cache.
   4. `azure/aks-set-context@v3` (resource group / cluster from repository variables `RESOURCE_GROUP`, `AKS_NAME`).
   5. Create namespaces, then create secrets **from GitHub Secrets**:
      ```bash
      kubectl apply -f k8s/app/namespace.yaml -f k8s/monitoring/namespace.yaml
      kubectl -n cv-attendance create secret generic backend-secrets \
        --from-literal=DATABASE_URL="${{ secrets.DATABASE_URL }}" \
        --from-literal=JWT_SECRET="${{ secrets.JWT_SECRET }}" \
        --from-literal=SIGNUP_INVITE_CODE="${{ secrets.SIGNUP_INVITE_CODE }}" \
        --from-literal=ADMIN_EMAIL="${{ secrets.ADMIN_EMAIL }}" \
        --from-literal=ADMIN_PASSWORD="${{ secrets.ADMIN_PASSWORD }}" \
        --dry-run=client -o yaml | kubectl apply -f -
      kubectl -n monitoring create secret generic grafana-admin \
        --from-literal=admin-password="${{ secrets.GRAFANA_ADMIN_PASSWORD }}" \
        --dry-run=client -o yaml | kubectl apply -f -
      ```
   6. Apply app manifests with the image substituted:
      ```bash
      export ACR_LOGIN_SERVER=${{ vars.ACR_NAME }}.azurecr.io IMAGE_TAG=${{ github.sha }}
      kubectl apply -f k8s/app/namespace.yaml -f k8s/app/configmap.yaml -f k8s/app/service.yaml
      envsubst < k8s/app/deployment.yaml | kubectl apply -f -
      kubectl apply -f k8s/monitoring/
      kubectl -n cv-attendance rollout status deployment/attendx-backend --timeout=300s
      ```
      (Do not `kubectl apply -f k8s/app/` blindly: it would try to apply `secret.example.yaml` and overwrite real secrets with placeholders. Apply files explicitly, or keep the example under a different directory.)
   7. Print the backend and Grafana external IPs.

Required GitHub **Secrets**: `AZURE_CREDENTIALS`, `DATABASE_URL`, `JWT_SECRET`, `SIGNUP_INVITE_CODE`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `GRAFANA_ADMIN_PASSWORD`, `TF_STATE_*` (as needed by your backend config).
Required GitHub **Variables**: `ACR_NAME`, `RESOURCE_GROUP`, `AKS_NAME`.

README must explain how to create the service principal (`az ad sp create-for-rbac --role Contributor --scopes /subscriptions/<id>/resourceGroups/<rg> --sdk-auth`) and note that student tenants sometimes block app registrations; in that case the user must ask their tenant admin or use their personal subscription's tenant.

Note: the service principal needs permission to create role assignments (`Owner` or `User Access Administrator`) on the resource group for the `AcrPull` assignment to succeed. Call this out; it is a common failure.

---

## 15. Frontend Contract (separate Next.js repo; spec only)

- `next.config.js` rewrites:
  ```js
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${process.env.BACKEND_URL}/api/:path*` }];
  }
  ```
  `BACKEND_URL` is a **server-side** Vercel env var (`http://<EXTERNAL-IP>`). The browser only ever calls relative `/api/...` URLs.
- All `fetch` calls: `credentials: "include"`, header `X-Requested-With: AttendX`, and on `401` call `/api/v1/auth/refresh` once then retry.
- Pages: `/signup`, `/login`, `/dashboard` (sessions list), `/students` (list, enroll, delete), `/sessions/[id]/scan`, `/sessions/[id]` (dashboard + export + manual add/remove).
- Scanner page behaviour: `getUserMedia` webcam; every ~1.5 s capture one frame, downscale to ≤640 px wide, JPEG quality 0.8; **never send a new request while one is in flight**; display friendly messages per error code (`NO_FACE_DETECTED`, `MULTIPLE_FACES_DETECTED`, `UNKNOWN_FACE`, `ALREADY_MARKED` with the returned student, `FACE_TOO_SMALL`, `LOW_QUALITY_FACE`).
- Do not store tokens in JS-accessible storage; cookies are httpOnly by design.

---

## 16. Implementation Plan — Build Order with Acceptance Checks

Do these in order. Stop and fix at any failed check.

**Phase 1 — Skeleton & config**
1. Create the repo structure (section 5), `.gitignore`, `pyproject.toml`, `config.py`, `errors.py`, `schemas.py`.
2. ✅ `docker compose build` succeeds (this proves the Dockerfile and model download).

**Phase 2 — Database**
3. Write `db/schema.sql` and `database.py` (pool, `register_vector`, all SQL functions as plain async functions; no string-formatted SQL — parameters only).
4. ✅ `docker compose up db` initializes the schema; `\dt` shows 6 tables, `\dx` shows `vector` and `citext`.

**Phase 3 — Auth**
5. Implement `security.py` and `routers/auth.py` per section 7, plus the CSRF header check and admin bootstrap.
6. ✅ Tests: password hash/verify, JWT expiry/type, refresh rotation, reuse detection revokes the family, disabled user rejected, missing CSRF header → 403.

**Phase 4 — Face engine**
7. Implement `face_service.py` per section 9 with executor + semaphore, and `metrics.py`.
8. ✅ Test with fixture images generated/downloaded at test time (no real student photos in the repo): 0 faces → `NO_FACE_DETECTED`; a two-person image → `MULTIPLE_FACES_DETECTED`; one face → 512 floats with norm ≈ 1.0; thumbnail decodes to 96×96.

**Phase 5 — Students & sessions API**
9. Implement routers per section 8, wire into `main.py` (lifespan loads model + pool, CORS from `FRONTEND_URL` for local dev, `PrometheusInstrumentator().instrument(app).expose(app, include_in_schema=False)`, exception handlers → error envelope).
10. ✅ Via `/docs`: sign up → register student → create session → mark (success) → mark again (`ALREADY_MARKED` with student data) → mark a different face (`UNKNOWN_FACE`) → dashboard shows 1 → CSV export opens correctly → delete student as admin cascades.

**Phase 6 — Infra as Code**
11. Write Terraform + `bootstrap-tfstate.sh`. ✅ `terraform validate` and `terraform plan` clean; after apply, `az aks get-credentials` and `kubectl get nodes` shows 1 Ready node; `az acr list` shows the registry; the AcrPull assignment exists.

**Phase 7 — Kubernetes**
12. Write app manifests; push a first image manually (`az acr login`, `docker push`), deploy. ✅ Pod becomes Ready (startup probe tolerates model load), `kubectl get svc -n cv-attendance` shows an external IP, `curl http://<ip>/ready` → 200.

**Phase 8 — Observability**
13. Write Prometheus and Grafana manifests. ✅ Prometheus UI (via `kubectl port-forward`) shows both targets `UP`; Grafana dashboard shows pod CPU/memory spiking while the user repeatedly calls `/mark`.

**Phase 9 — CI/CD**
14. Write `deploy.yml`. ✅ A push to `main` runs tests → builds → pushes SHA-tagged image → deploys → `rollout status` succeeds. A push touching `terraform/**` additionally runs the Terraform job.

**Phase 10 — Hardening & docs**
15. Verify: `docker run` as non-root works; `/docs` disabled when `ENV=production`; no secrets in git (`git grep -i password` review); RLS enabled on all tables.
16. Write `README.md` with: local run, Supabase setup, Terraform bootstrap, GitHub secrets/variables, deploy, start/stop cluster, **Limitations** (no liveness detection, one face at a time, threshold tuning, single replica downtime during deploys), and a **viva demo script** (below).

---

## 17. Viva / Demo Script (include in README)

1. `terraform plan` → show RG, ACR, AKS, role assignment (IaC).
2. `kubectl get pods,svc -A` → explain Namespace, Deployment, Service, ConfigMap, Secret, probes, requests/limits.
3. Show the git-SHA image tag in `kubectl describe pod` and explain why not `:latest`.
4. Open Grafana, scan faces repeatedly → show CPU/memory and `attendx_embedding_seconds` reacting.
5. `kubectl delete pod` → show self-healing and the readiness probe holding traffic until the model is loaded.
6. Push a trivial change → watch GitHub Actions deploy end-to-end.
7. Explain pgvector: 512-d ArcFace embedding, `<=>` cosine distance, HNSW index, threshold trade-off (false accept vs false reject).
8. Explain the security choices: httpOnly cookies, refresh rotation, RLS, no secrets in git, invite-only signup. Mention biometric data sensitivity and that deletion cascades (consent/erasure).
9. Be upfront about the limitation: no liveness detection.

---

## 18. Definition of Done

- [ ] `docker compose up` gives a working local API with auth, enrollment, scanning, dashboard, export.
- [ ] `db/schema.sql` runs unmodified on Supabase and on the local pgvector container.
- [ ] `terraform apply` provisions RG + ACR + AKS (1× B2s) + AcrPull.
- [ ] A push to `main` deploys a SHA-tagged image to AKS with a successful rollout.
- [ ] Prometheus scrapes the app and cAdvisor; Grafana dashboard shows CPU/memory during scans.
- [ ] No real secrets in git; RLS enabled; signup requires the invite code.
- [ ] README documents limitations honestly.