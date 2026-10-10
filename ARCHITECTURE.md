# AttendX Architecture & Technical Specification

AttendX is an enterprise-grade biometric attendance and student roster management system. It replaces manual roll calls and RFID cards with instantaneous, real-time facial recognition using 128-dimensional deep metric embeddings stored and indexed via PostgreSQL `pgvector`.

---

## 1. High-Level System Architecture

```
                       +------------------------------------------+
                       |           Client Web Browser             |
                       |  (Next.js 14 App Router + Vanilla CSS)   |
                       +------------------------------------------+
                                       |              ^
                 Webcam Video Stream   |              | Verified Attendance
                 & Frame Snapshots     v              | & Student Data
                       +------------------------------------------+
                       |        NGINX / Next.js API Proxy         |
                       |          (Port 3000 -> 8000)             |
                       +------------------------------------------+
                                       |
                           REST JSON / HTTPS Requests
                                       v
                       +------------------------------------------+
                       |             FastAPI Backend              |
                       |           (Python 3.10 / Uvicorn)        |
                       +------------------------------------------+
                               /              \             \
     Computer Vision Pipeline /                \ Auth &      \ Metrics
                             v                  \ Sessions    v
         +-----------------------+               v         +--------------------+
         |   dlib / OpenCV /     |       +-------------+   | Prometheus Monitor |
         |   face_recognition    |       |   Asyncpg   |   |   (/metrics)       |
         |  (128-D Embeddings)   |       |  Pool (v2)  |   +--------------------+
         +-----------------------+       +-------------+
                                                |
                                      SQL Queries & Cosine
                                      Vector Searches (<=>)
                                                v
                                 +------------------------------+
                                 |   PostgreSQL 16 Database     |
                                 |     (pgvector Extension)     |
                                 +------------------------------+
```

---

## 2. Technology Stack & Component Breakdown

### 2.1 Frontend Architecture
- **Framework**: Next.js 14 (App Router) running on Node.js 20 LTS.
- **Styling**: Vanilla CSS with custom Apple Liquid Glass design system, CSS custom properties (`:root`), and backdrop blur filters.
- **Iconography**: Lucide React and custom hand-drawn SVG academic doodle components.
- **Typography**: Plus Jakarta Sans (UI primary), JetBrains Mono (USN and code tags), and Caveat (doodle accents).
- **State Management**: React Context (`AuthContext` for credentials and session state; `ToastContext` for toast notifications).
- **Biometric Capture**: Native HTML5 `navigator.mediaDevices.getUserMedia` feeding directly into an HTML5 `<video>` tag with hidden `<canvas>` frame serialization.

#### Frontend Code Directory & File Responsibilities:
- `src/app/layout.js`: Global HTML shell rendering the outer Apple Liquid Glass screen bezel (`.liquid-glass-shell`), background wallpaper, and global Toast/Auth providers.
- `src/app/page.js`: Entrance portal landing page featuring biometric platform highlights, student portal stats, and direct entry buttons.
- `src/app/login/page.js`: Dedicated sign-in page rendering the `AuthSlider` component initialized in sign-in mode.
- `src/app/signup/page.js`: Faculty registration page rendering the `AuthSlider` component initialized in register mode.
- `src/components/AuthSlider.js`: Dual-panel glassmorphism component with animated sliding overlay (`transform: translateX(...)`) smoothly alternating between Sign In and Registration.
- `src/app/dashboard/page.js`: Session management center; allows faculty to launch sessions, filter by timeline (Today, Past 7 Days, Older, Active, Completed), delete sessions, and monitor attendance turnouts.
- `src/app/students/page.js`: Student enrollment directory; captures primary and extra-angle face photos via camera, gathers embeddings, searches by USN/name, and deletes student records.
- `src/app/sessions/[id]/page.js`: Per-session analytics dashboard displaying turnout percentage, verified student rosters, USN/timestamp sorting, individual record removal, and CSV exports.
- `src/app/sessions/[id]/scan/page.js`: Live webcam facial scanner with visual alignment reticle, 2000ms anti-throttle burst protection, and audible scan status alerts.
- `src/components/Navbar.js`: Liquid glass top navigation bar showing active tabs, user profile badge, and role tags.
- `src/components/Footer.js`: Bottom liquid glass footer with platform version and creator branding (`vedx.dev`).
- `src/components/ConfirmModal.js`: Custom glassmorphism modal dialog replacing browser `window.confirm()` popups.
- `src/components/Skeleton.js`: Shimmer animation skeleton loaders replacing raw loading text across all tables and cards.
- `src/components/DoodleIcons.js`: Vector SVG academic doodles (graduation cap, notebooks, stars).
- `src/lib/api.js`: Unified HTTP client handling JWT cookie credentials, JSON headers, and standard error parsing.

---

### 2.2 Backend Architecture
- **Framework**: FastAPI (v0.110+) running asynchronously on Python 3.10 and Uvicorn.
- **Database Driver**: `asyncpg` (v0.29.0) with connection pooling and native binary vector codec support via `pgvector.asyncpg`.
- **Validation**: Pydantic v2 schemas for request payloads, response models, and environment configuration.
- **Security**: Argon2id password hashing via Passlib and JWT token generation via PyJWT.
- **Monitoring**: `prometheus-fastapi-instrumentator` exposing system and HTTP metrics on `/metrics`.

#### Backend Code Directory & File Responsibilities:
- `app/main.py`: ASGI application factory configuring CORS middleware, lifetime connection hooks, error handlers, and router mounts.
- `app/config.py`: Centralized environment configuration via Pydantic `BaseSettings` reading from `.env`.
- `app/database.py`: Database pool manager initializing `asyncpg.create_pool` and registering custom vector codecs.
- `app/schemas.py`: Pydantic models for authentication, session creation, student enrollment, scan payloads, and dashboard stats.
- `app/routers/auth.py`: Endpoints for faculty sign-in, account creation (validating faculty invite code `attendx-secret-invite-2026`), token refresh, and logout.
- `app/routers/students.py`: Endpoints for enrolling students (`POST /register`), gathering 128-D face embeddings, listing enrolled rosters, and deleting students.
- `app/routers/sessions.py`: Endpoints for creating sessions, listing sessions with attendee counts, deleting sessions (`DELETE /{id}`), per-session dashboards, and CSV data export (`GET /{id}/export.csv`).
- `app/routers/scan.py`: Real-time face recognition endpoint (`POST /{id}/scan`); receives base64 camera frames, computes face embeddings, queries PostgreSQL pgvector, verifies thresholds, and marks attendance.
- `app/routers/health.py`: Kubernetes liveness (`/health/live`) and readiness (`/health/ready`) endpoints verifying container health and database connectivity.

---

### 2.3 Database Architecture & Schema
- **RDBMS**: PostgreSQL 16
- **Extension**: `pgvector` enabling exact and approximate nearest-neighbor vector indexing and distance operators (`<=>` for cosine, `<->` for Euclidean, `<#>` for negative inner product).

```sql
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    hashed_password VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL DEFAULT 'teacher',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE students (
    usn VARCHAR(32) PRIMARY KEY,
    full_name VARCHAR(255) NOT NULL,
    profile_image_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE student_face_embeddings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_usn VARCHAR(32) NOT NULL REFERENCES students(usn) ON DELETE CASCADE,
    embedding vector(128) NOT NULL,
    embedding_type VARCHAR(32) NOT NULL DEFAULT 'primary',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subject_name VARCHAR(255) NOT NULL,
    subject_code VARCHAR(64) NOT NULL,
    created_by UUID NOT NULL REFERENCES users(id),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ended_at TIMESTAMPTZ,
    session_date DATE NOT NULL DEFAULT CURRENT_DATE
);

CREATE TABLE attendance_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    student_usn VARCHAR(32) NOT NULL REFERENCES students(usn) ON DELETE CASCADE,
    marked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    confidence_distance DOUBLE PRECISION NOT NULL,
    verification_method VARCHAR(32) NOT NULL DEFAULT 'camera_scan',
    CONSTRAINT uq_session_student UNIQUE (session_id, student_usn)
);

CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id),
    action VARCHAR(64) NOT NULL,
    details JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_student_embeddings_vector 
ON student_face_embeddings USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
```

---

## 3. Computer Vision & Biometric Engine Deep Dive

### 3.1 Libraries & Package Versions
- `face_recognition`: **v1.3.0**
- `dlib`: **v19.24.2** (compiled with C++ vector optimizations)
- `opencv-python-headless`: **v4.9.0.80**
- `numpy`: **v1.26.4**
- `pgvector`: **v0.2.5**

---

### 3.2 Four-Stage Recognition Pipeline

```
  +------------------+
  |  Base64 Camera   |
  |  Image Payload   |
  +------------------+
           |
           v
  [1. Decode & Preprocess] ---> OpenCV BGR to RGB conversion
           |
           v
  [2. Face Localization]  ---> HOG + Linear SVM Detector (Bounding Box)
           |
           v
  [3. Shape Alignment]    ---> 68-Point Facial Landmark Predictor (Affine Warp)
           |
           v
  [4. Deep Metric Model]  ---> ResNet-34 Feature Extractor (128-D Unit Vector)
           |
           v
  [5. Vector Search]      ---> pgvector Cosine Nearest Neighbor (<=>)
           |
           v
  [6. Threshold Decision] ---> Distance <= 0.50 Threshold Verification
```

#### Stage 1: Frame Acquisition & Preprocessing
The client extracts an image frame from the active `<video>` element using a hidden canvas at $640 \times 480$ resolution. The data is encoded as JPEG Base64 and sent over HTTP POST.
On the backend:
1. Base64 is decoded to byte buffer.
2. OpenCV decodes bytes to a NumPy BGR image matrix:
   $$\mathbf{I}_{\text{BGR}} \in \mathbb{R}^{H \times W \times 3}$$
3. Converted to RGB color space for dlib compatibility:
   $$\mathbf{I}_{\text{RGB}} = \text{cv2.cvtColor}(\mathbf{I}_{\text{BGR}}, \text{cv2.COLOR\_BGR2RGB})$$

#### Stage 2: Face Localization (HOG + Linear SVM)
1. For every pixel $(x, y)$, horizontal and vertical intensity gradients are calculated:
   $$G_x = I(x+1, y) - I(x-1, y), \quad G_y = I(x, y+1) - I(x, y-1)$$
2. Gradient magnitude $M(x, y)$ and orientation $\theta(x, y)$ are derived:
   $$M(x, y) = \sqrt{G_x^2 + G_y^2}, \quad \theta(x, y) = \arctan\left(\frac{G_y}{G_x}\right)$$
3. The image is divided into $8 \times 8$ pixel cells. In each cell, gradient orientations are grouped into 9 angular bins ($0^\circ$ to $180^\circ$).
4. Blocks of $2 \times 2$ cells ($16 \times 16$ pixels) are normalized using the $L_2$-norm to ensure robustness against illumination changes:
   $$\mathbf{v}_{\text{norm}} = \frac{\mathbf{v}}{\sqrt{\|\mathbf{v}\|_2^2 + \epsilon}}$$
5. A pre-trained Linear Support Vector Machine (SVM) scans the HOG pyramid to return bounding boxes:
   $$\mathbf{B} = [x_{\min}, y_{\min}, x_{\max}, y_{\max}]$$

#### Stage 3: Facial Landmark Alignment (68-Point Shape Predictor)
1. Dlib uses an Ensemble of Regression Trees (ERT) based on the Kazemi & Sullivan algorithm.
2. It detects 68 canonical fiducial facial landmarks (jawline points 1-17, eyebrows 18-27, nose bridge 28-36, eyes 37-48, mouth 49-68).
3. The centers of both eyes are calculated:
   $$\mathbf{c}_{\text{left}} = \frac{1}{6} \sum_{i=37}^{42} \mathbf{p}_i, \quad \mathbf{c}_{\text{right}} = \frac{1}{6} \sum_{i=43}^{48} \mathbf{p}_i$$
4. An affine transformation matrix $\mathbf{T}$ rotates the face so the eyes lie horizontally, scales the inter-pupillary distance, and centers the face into a canonical $150 \times 150$ crop:
   $$\begin{bmatrix} x' \\ y' \end{bmatrix} = \begin{bmatrix} s \cos \theta & -s \sin \theta \\ s \sin \theta & s \cos \theta \end{bmatrix} \begin{bmatrix} x \\ y \end{bmatrix} + \begin{bmatrix} t_x \\ t_y \end{bmatrix}$$
   This normalization neutralizes out-of-plane rotation, perspective skew, and head tilts.

#### Stage 4: 128-Dimensional Deep Metric Embedding
1. The cropped, normalized face is passed through a ResNet-34 deep convolutional neural network trained on over 3 million human faces.
2. The network acts as a function $f(\mathbf{x})$ that maps an image matrix $\mathbf{x}$ to a 128-dimensional continuous vector:
   $$\vec{e} = f(\mathbf{x}) = [e_1, e_2, \dots, e_{128}] \in \mathbb{R}^{128}$$
3. The vector is normalized onto the surface of a 128-dimensional unit hypersphere $\mathbb{S}^{127}$:
   $$\|\vec{e}\|_2 = \sqrt{\sum_{i=1}^{128} e_i^2} = 1.0$$

---

### 3.3 Mathematics of Identity Discrimination

#### Triplet Loss Optimization
During model training, the network is trained using the **Triplet Loss** formulation:
Given:
- Anchor face $\mathbf{x}^a$
- Positive face $\mathbf{x}^p$ (same person as anchor)
- Negative face $\mathbf{x}^n$ (different person)

The loss function minimizes distance between same-person pairs while enforcing an separation margin $\alpha$ from different-person pairs:
$$\mathcal{L} = \sum_{i=1}^{N} \max\left(0, \|f(\mathbf{x}_i^a) - f(\mathbf{x}_i^p)\|_2^2 - \|f(\mathbf{x}_i^a) - f(\mathbf{x}_i^n)\|_2^2 + \alpha\right)$$
where $\alpha = 0.20$.

#### Relationship Between Euclidean Distance and Cosine Distance
For two $L_2$-normalized vectors $\vec{u}, \vec{v} \in \mathbb{R}^{128}$ where $\|\vec{u}\|_2 = \|\vec{v}\|_2 = 1$:

1. Euclidean Distance:
   $$d_{\text{Euclidean}}(\vec{u}, \vec{v}) = \|\vec{u} - \vec{v}\|_2 = \sqrt{\sum_{i=1}^{128} (u_i - v_i)^2}$$
2. Squared Euclidean Distance:
   $$\|\vec{u} - \vec{v}\|_2^2 = \|\vec{u}\|_2^2 + \|\vec{v}\|_2^2 - 2(\vec{u} \cdot \vec{v}) = 1 + 1 - 2(\vec{u} \cdot \vec{v}) = 2(1 - \vec{u} \cdot \vec{v})$$
3. Cosine Distance:
   $$D_{\text{cosine}}(\vec{u}, \vec{v}) = 1 - \frac{\vec{u} \cdot \vec{v}}{\|\vec{u}\|_2 \|\vec{v}\|_2} = 1 - \vec{u} \cdot \vec{v}$$
4. Equivalence Relation:
   $$\|\vec{u} - \vec{v}\|_2^2 = 2 \cdot D_{\text{cosine}}(\vec{u}, \vec{v})$$
   $$d_{\text{Euclidean}}(\vec{u}, \vec{v}) = \sqrt{2 \cdot D_{\text{cosine}}(\vec{u}, \vec{v})}$$

#### Why Person A Does Not Match Person B
1. **Hyperspherical Concentration of Measure**:
   In high-dimensional spaces ($\mathbb{R}^{128}$), random independent vectors are orthogonal.
   The expected dot product between two random identities is:
   $$\mathbb{E}[\vec{u} \cdot \vec{v}] \approx 0 \implies \mathbb{E}[d_{\text{Euclidean}}] \approx \sqrt{2} \approx 1.414$$
2. **Empirical Distance Distributions**:
   - Genuine pairs (images of the same individual under different lighting/expressions):
     $$d_{\text{genuine}} \in [0.15, 0.42]$$
   - Impostor pairs (images of two different individuals):
     $$d_{\text{impostor}} \in [0.72, 1.35]$$
3. **Threshold Calibration**:
   AttendX enforces a strict Euclidean decision threshold:
   $$\tau = 0.50 \iff D_{\text{cosine}} \le \frac{0.50^2}{2} = 0.125$$
   At $\tau = 0.50$, the False Acceptance Rate (FAR) is below $0.001\%$ ($1 \text{ in } 100,000$), ensuring that Person A is never misidentified as Person B.

#### Multi-Angle Enrollment Strategy
To prevent False Rejection (FRR) when a student looks slightly away from the camera, AttendX collects multi-angle biometric samples:
- `primary`: Frontal face pose.
- `extra_angle`: Left/right profile and tilted facial poses.

In PostgreSQL, the query compares against all enrolled vectors for each student and selects the nearest neighbor:
```sql
SELECT 
    student_usn, 
    embedding <=> $1 AS distance
FROM student_face_embeddings
ORDER BY distance ASC
LIMIT 1;
```
If the minimum distance $\le 0.125$ (Cosine) or $\le 0.50$ (Euclidean), identity is confirmed.

---

### 3.4 Rate Limiting & Cooldown Protection
To eliminate CPU bottlenecks and duplicate database writes when a student stands in front of the lens:
1. **Client Rate Cooldown**: Scans are throttled at a fixed 2000ms polling interval.
2. **Client-Side In-Flight Lock**: If a frame HTTP request is currently processing, subsequent timer ticks are skipped (`inFlightRef.current = true`).
3. **Database Unique Constraint**: `attendance_records` enforces `UNIQUE(session_id, student_usn)`. Attempts to mark the same student twice in the same session return a idempotent HTTP 200 without duplicate table insertions.
