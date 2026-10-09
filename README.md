# AttendX — Computer Vision Attendance System

AttendX is a production-grade facial recognition attendance system designed for university classrooms, built on a unified Next.js + FastAPI + pgvector architecture.

---

## 1. Monorepo Architecture

- **`frontend/`**: Next.js 14 App Router, WebRTC webcam face capture, live camera scanner with auto-downscaling, real-time feedback, and institutional dashboard.
- **`backend/`**: FastAPI with InsightFace (`buffalo_l`) and ONNX Runtime CPU, pgvector cosine similarity search, argon2id hashing, and rotating JWT tokens.
- **Deployment Topology on Azure (AKS)**:
  - **Frontend Service**: Public `LoadBalancer` on port 80. Only the frontend is exposed from the VM/cluster.
  - **Backend Service**: Internal `ClusterIP` on port 8000. Not exposed to the public internet.
  - Next.js proxies all `/api/*` requests server-side to the internal backend service, eliminating mixed-content and cross-site cookie restrictions.

---

## 2. Local Development (Docker Compose)

No host dependencies (Python, Node, PostgreSQL, OpenCV) are required. Local development runs via Docker Compose.

### Quickstart

1. Copy the example environment file:
```bash
cp backend/.env.example backend/.env
```

2. Configure environment variables in `backend/.env`:
- `JWT_SECRET`: Random string with at least 32 characters
- `SIGNUP_INVITE_CODE`: Secret invite code required for registration
- `ADMIN_EMAIL`: Admin email for initial bootstrap
- `ADMIN_PASSWORD`: Admin password for initial bootstrap

3. Start services:
```bash
docker compose up --build
```

4. Access services:
- Frontend Web App: http://localhost:3000
- Backend API Documentation: http://localhost:8000/docs
- Health Check: http://localhost:8000/health
- Readiness Check: http://localhost:8000/ready
- Prometheus Metrics: http://localhost:8000/metrics

---

## 3. Supabase Setup

1. Create a Supabase project.
2. In the Supabase SQL Editor, run the contents of `db/schema.sql`.
3. Obtain the connection string:
   - Navigate to **Project Settings** > **Database** > **Connection Pooling**.
   - Select the **Session Pooler** on port **5432** (IPv4 compatible).
   - Direct database connections on the free tier are IPv6-only and will not resolve from AKS nodes.
4. Pass the connection string as `DATABASE_URL` with `sslmode=require`.

---

## 4. Azure Infrastructure & Terraform

Infrastructure is defined in `terraform/`:
- Resource Group
- Azure Container Registry (ACR Basic)
- Azure Kubernetes Service (AKS Free tier, 1x Standard_B2s node)
- AcrPull role assignment for AKS kubelet identity

### Terraform Remote State Bootstrap

Run the provided bootstrap script:
```bash
./scripts/bootstrap-tfstate.sh
```

### Terraform Execution

```bash
cd terraform
cp terraform.tfvars.example terraform.tfvars
terraform init -backend-config="resource_group_name=<TF_STATE_RG>" -backend-config="storage_account_name=<STORAGE_ACCOUNT>" -backend-config="container_name=tfstate" -backend-config="key=attendx.tfstate"
terraform plan
terraform apply
```

### Cost Management (Azure for Students)

To avoid consuming student credits when not demonstrating:
```bash
az aks stop --name attendx-aks --resource-group attendx-rg
```

Before demo or deployment:
```bash
az aks start --name attendx-aks --resource-group attendx-rg
```

---

## 5. Kubernetes Manifests

Raw Kubernetes manifests are located in `k8s/`:
- `k8s/app/`: Application namespace, ConfigMap, Deployment & internal ClusterIP for backend, Deployment & public LoadBalancer for frontend.
- `k8s/monitoring/`: Monitoring namespace, Prometheus RBAC/ConfigMap/Deployment/ClusterIP, and Grafana Deployment/LoadBalancer.

---

## 6. CI/CD Pipeline (GitHub Actions)

The deployment workflow in `.github/workflows/deploy.yml` manages automated testing, infrastructure updates, image building, and AKS rollout for both backend and frontend.

### Required GitHub Secrets
- `AZURE_CREDENTIALS`: Service Principal credentials JSON
- `DATABASE_URL`: Supabase Session Pooler connection string
- `JWT_SECRET`: Random string with at least 32 characters
- `SIGNUP_INVITE_CODE`: Registration invitation code
- `ADMIN_EMAIL`: Initial admin account email
- `ADMIN_PASSWORD`: Initial admin account password
- `GRAFANA_ADMIN_PASSWORD`: Admin password for Grafana UI
- `TF_STATE_RG`: Storage account resource group name
- `TF_STATE_STORAGE_ACCOUNT`: Storage account name for tfstate
- `TF_STATE_CONTAINER`: Storage container name (`tfstate`)

### Required GitHub Variables
- `ACR_NAME`: Azure Container Registry name
- `RESOURCE_GROUP`: Target resource group name
- `AKS_NAME`: AKS cluster name

---

## 7. System Limitations

1. **No Anti-Spoofing / Liveness Detection**: The facial recognition pipeline performs ArcFace feature extraction on detected faces. It does not perform active or passive liveness verification; photos displayed on screens or printed media can mark attendance.
2. **Single-Face Scanning**: The scanner is designed to process one face per frame. Frames containing multiple detected faces are rejected with HTTP 409 (`MULTIPLE_FACES_DETECTED`).
3. **Single Replica Rolling Updates**: Due to single-node resource budgets (1x Standard_B2s with 4 GiB RAM), deployments operate with 1 replica, `maxSurge: 0`, and `maxUnavailable: 1`. Rolling updates incur a brief downtime window during pod replacement.
4. **Biometric Data Erasure**: Deleting a student cascades immediately to remove all associated 512-d embeddings and attendance history records.
5. **Threshold Tuning**: Default cosine distance thresholds are set conservatively (`MATCH_THRESHOLD=0.40`, `DUPLICATE_THRESHOLD=0.30`). These can be adjusted via environment configuration based on enrollment sample variance.

---

## 8. Viva & Demonstration Script

1. **Monorepo Architecture**:
   - Demonstrate `frontend/` (Next.js) and `backend/` (FastAPI).
   - Explain why the frontend is the only public service on port 80 while the backend is an internal `ClusterIP`.
   - Explain server-side Next.js rewrites to prevent mixed content and cross-site cookie restrictions.

2. **Infrastructure as Code**:
   - Inspect `terraform/main.tf` to present the Resource Group, ACR, AKS, and AcrPull role assignment.
   - Run `terraform plan` to demonstrate declarative infrastructure state.

3. **Kubernetes Architecture**:
   - Run `kubectl get pods,svc -A` to show namespace segregation (`cv-attendance`, `monitoring`).
   - Highlight the deployment probes: `startupProbe` (accommodates ONNX model initialization), `readinessProbe` (verifies DB connectivity and loaded weights), and `livenessProbe`.

4. **Biometrics & Vector Search**:
   - Explain ArcFace 512-dimensional embeddings stored in `pgvector`.
   - Explain cosine distance ordering (`ORDER BY e.embedding <=> $1::vector`) and HNSW index structures.

5. **Security Controls**:
   - Explain `httpOnly`, `SameSite=Lax` cookie storage for JWT access and opaque refresh tokens.
   - Explain refresh token rotation with family revocation on reuse detection.
   - Demonstrate Row Level Security (RLS) enabled on all tables to lock out public Supabase REST endpoints.
   - Show `X-Requested-With: AttendX` CSRF mitigation on state-changing endpoints.

6. **Observability & Monitoring**:
   - Open Grafana on port 3000.
   - Trigger face scan requests and view real-time CPU, memory, P95 latency, and custom metrics (`attendx_embedding_seconds`, `attendx_match_total`).