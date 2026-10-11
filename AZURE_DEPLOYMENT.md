# AttendX Azure Cloud & Kubernetes Deployment Guide

This guide details the complete production deployment of AttendX on Microsoft Azure using the Azure Portal (Web UI), Docker, Azure Kubernetes Service (AKS), native Kubernetes manifests without Helm, Ingress, Horizontal Pod Autoscaler (HPA), Vertical Pod Autoscaler (VPA), Prometheus, and Grafana.

---

## 1. Cloud Architecture & Production Services

```
                       Internet Traffic / End Users
                                     |
                                     v
                       [ Azure Public IP / DNS ]
                                     |
                                     v
                       [ NGINX Ingress Controller ]
                         (Official Cloud Manifest)
                                     |
                   +-----------------+-----------------+
                   | Path: /                           | Path: /api
                   v                                   v
       +-----------------------+           +-----------------------+
       |   attendx-frontend    |           |    attendx-backend    |
       |  Service (ClusterIP)  |           |  Service (ClusterIP)  |
       +-----------------------+           +-----------------------+
                   |                                   |
                   v                                   v
       +-----------------------+           +-----------------------+
       |     Frontend Pods     |           |     Backend Pods      |
       |  (HPA: 1 - 5 Replicas)|           |  (HPA: 1 - 10 Replicas)
       +-----------------------+           +-----------------------+
                                                       |
                                     +-----------------+-----------------+
                                     |                                   |
                                     v                                   v
                        +-------------------------+         +-------------------------+
                        |  Azure Container Reg.   |         |   Managed Supabase      |
                        |      (ACR Basic)        |         |   PostgreSQL Instance   |
                        | (attendxcr.azurecr.io)  |         | (pgvector + Port 5432)  |
                        +-------------------------+         +-------------------------+
                                                                         ^
                                                                         | Scrapes /metrics
                                                            +-------------------------+
                                                            |  Prometheus & Grafana   |
                                                            |  (Namespace: monitoring)|
                                                            +-------------------------+
```

### Production Database Decision: Supabase PostgreSQL
AttendX utilizes Supabase PostgreSQL in production rather than provisioning a duplicate Azure Database for PostgreSQL Flexible Server for the following technical and operational reasons:
1. **Pre-configured Vector Support**: Supabase has native `pgvector` enabled, and our schemas (`students`, `face_embeddings`, `attendance_logs`, `sessions`, `users`, `system_settings`), cosine indexes (`vector_cosine_ops`), and enrolled biometric vectors are already configured and validated.
2. **Cost Optimization**: Provisioning an Azure Database for PostgreSQL Flexible Server adds recurring monthly costs, whereas an existing managed Supabase instance incurs zero additional database provisioning fees.
3. **Encrypted Network Transit**: AKS backend pods securely communicate with Supabase over TLS (`sslmode=require`) through connection pooling on port 6543 (Supavisor) or direct connections on port 5432.
4. **Secret Decoupling**: Database credentials reside entirely in a Kubernetes Secret (`backend-secrets`), allowing environment independence without hardcoded endpoints.

### Azure Services Utilized:
1. **Azure Resource Group (`rg-attendx-prod`)**: Logical grouping for all cloud compute and container resources.
2. **Azure Container Registry (`attendxcr`)**: Private Docker image registry storing verified AttendX backend and frontend container images.
3. **Azure Kubernetes Service (`aks-attendx-cluster`)**: Managed Kubernetes cluster managing scheduling, scaling, and health reconciliation.
4. **Azure Public IP & Standard Load Balancer**: Automatically provisioned by the NGINX Ingress Controller service to expose the cluster externally.

---

## 2. Azure Portal (UI) Provisioning Walkthrough

### Step 2.1: Create the Resource Group
1. Open the [Azure Portal](https://portal.azure.com) in your browser.
2. In the top search bar, search for `Resource groups` and select it.
3. Click **+ Create**.
4. Configure the settings:
   - **Subscription**: Select your active Azure subscription.
   - **Resource group**: `rg-attendx-prod`
   - **Region**: `East US` (or your nearest preferred location).
5. Click **Review + create**, then click **Create**.

---

### Step 2.2: Create Azure Container Registry (ACR)
1. Search for `Container registries` in the search bar and select it.
2. Click **+ Create**.
3. Configure the **Basics** tab:
   - **Resource group**: `rg-attendx-prod`
   - **Registry name**: `attendxcr` (must be globally unique and alphanumeric).
   - **Location**: `East US`.
   - **SKU**: `Basic`.
4. Click **Review + create**, then click **Create**.
5. When provisioning finishes, click **Go to resource**.
6. In the left sidebar under **Settings**, select **Access keys**.
7. Toggle **Admin user** to **Enabled**.
8. Record the following values for building and pushing:
   - Login server: `attendxcr.azurecr.io`
   - Username: `attendxcr`
   - Password: `<your-acr-password>`

---

### Step 2.3: Create Azure Kubernetes Service (AKS) Cluster
1. Search for `Kubernetes services` in the search bar and select it.
2. Click **+ Create** and choose **Create a Kubernetes cluster**.
3. Configure the **Basics** tab:
   - **Resource group**: `rg-attendx-prod`
   - **Cluster preset configuration**: `Dev/Test` or `Cost-optimised`.
   - **Kubernetes cluster name**: `aks-attendx-cluster`
   - **Region**: `East US`.
   - **Kubernetes version**: Select the default stable version (e.g., 1.28 or 1.29).
   - **Node pools**:
     - Name: `nodepool1`
     - Node size: Click *Choose a size* and select `Standard_B2s` (2 vCPU, 4 GiB RAM) or `Standard_D2s_v5` (2 vCPU, 8 GiB RAM).
     - Scale method: `Manual` with Node count set to `2` (or `Autoscale` between 1 and 3).
4. Configure the **Networking** tab:
   - **Network configuration**: `Kubenet`.
5. Configure the **Integrations** tab:
   - **Container registry**: Select **attendxcr** from the dropdown. This automatically attaches the `AcrPull` role to AKS so pods can pull images without manual image pull secrets.
6. Configure the **Monitoring** tab:
   - Azure Container Insights can remain unchecked since we deploy native Prometheus and Grafana.
7. Click **Review + create**, then click **Create**. Deployment will take roughly 5 to 7 minutes.

---

### Step 2.4: Connect to the Cluster
Once the cluster deployment is complete:
1. Open the AKS cluster in the Azure Portal.
2. Click **Connect** on the overview toolbar.
3. Use the Azure Cloud Shell (`>_` button in the Azure Portal top bar) or run in your local terminal:

```bash
az login
az account set --subscription "<YOUR_SUBSCRIPTION_ID>"
az aks get-credentials --resource-group rg-attendx-prod --name aks-attendx-cluster
```

Verify connection to the nodes:
```bash
kubectl get nodes
```

---

## 3. Container Image Build & Push

Run the following commands from the root of the repository:

### 3.1 Authenticate Docker with Azure Container Registry
```bash
docker login attendxcr.azurecr.io -u attendxcr -p <ACR_PASSWORD>
```

### 3.2 Build and Push Backend Image
```bash
docker build -t attendxcr.azurecr.io/attendx-backend:v1 ./backend
docker push attendxcr.azurecr.io/attendx-backend:v1
```

### 3.3 Build and Push Frontend Image
```bash
docker build -t attendxcr.azurecr.io/attendx-frontend:v1 ./frontend
docker push attendxcr.azurecr.io/attendx-frontend:v1
```

---

## 4. Helm-Free Kubernetes Architecture Explained

This deployment uses 100% native declarative Kubernetes manifests (`kubectl apply -f`). This provides direct control and complete visibility over each Kubernetes API object:

| Kubernetes Primitive | File Location | Architectural Purpose |
| :--- | :--- | :--- |
| **Namespace** | `k8s/app/namespace.yaml` | Isolates AttendX workloads in the `attendx` namespace. |
| **ConfigMap** | `k8s/app/configmap.yaml` | Provides non-sensitive runtime configuration parameters (thresholds, origins, durations). |
| **Secret** | `k8s/app/secret.yaml` | Protects sensitive credentials (Supabase `DATABASE_URL`, JWT signing keys, invite codes). |
| **Deployment (Backend)** | `k8s/app/deployment.yaml` | Manages backend pod replicas, resource limits, rolling updates, and health probes. |
| **Service (Backend)** | `k8s/app/service.yaml` | Provides internal DNS name `attendx-backend-service` and load balances across backend pods. |
| **Deployment (Frontend)** | `k8s/app/frontend-deployment.yaml` | Manages Next.js frontend pod replicas and points `BACKEND_URL` to internal backend service. |
| **Service (Frontend)** | `k8s/app/frontend-service.yaml` | Provides internal DNS name `attendx-frontend-service` on port 3000. |
| **Ingress** | `k8s/app/ingress.yaml` | Routes external HTTP traffic: `/api` to the backend and `/` to the frontend. |
| **HPA** | `k8s/app/hpa.yaml` | Automatically scales backend and frontend pods horizontally under CPU/memory load. |
| **VPA** | `k8s/app/vpa.yaml` | Analyzes resource consumption and outputs recommendations for CPU and memory sizing. |
| **RBAC & Prometheus** | `k8s/monitoring/prometheus.yaml` | Deploys Prometheus with ClusterRole and ServiceAccount to scrape cluster metrics. |
| **Grafana** | `k8s/monitoring/grafana.yaml` | Deploys Grafana with pre-wired Prometheus datasource for real-time visualization. |

---

## 5. Step-by-Step Native Kubernetes Deployment

### Step 5.1: Deploy Official NGINX Ingress Controller (Without Helm)
Deploy the official cloud-provider NGINX Ingress Controller manifest directly via `kubectl`:

```bash
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/controller-v1.10.0/deploy/static/provider/cloud/deploy.yaml
```

Wait for Azure to allocate an external Public IP:
```bash
kubectl get svc -n ingress-nginx ingress-nginx-controller -w
```

When the `EXTERNAL-IP` changes from `<pending>` to a public IP (e.g., `20.120.45.10`), note this IP address.

---

### Step 5.2: Create Application Namespace
```bash
kubectl apply -f k8s/app/namespace.yaml
```

Verify:
```bash
kubectl get namespaces
```

---

### Step 5.3: Create Production Secrets (Supabase Credentials)
Prepare your production secret containing your Supabase database URL. Create `k8s/app/secret.yaml` from `k8s/app/secret.example.yaml`:

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: backend-secrets
  namespace: attendx
type: Opaque
stringData:
  DATABASE_URL: "postgresql://postgres:<YOUR-SUPABASE-PASSWORD>@db.<YOUR-PROJECT-REF>.supabase.co:5432/postgres?sslmode=require"
  JWT_SECRET: "attendx-production-secure-random-jwt-key-minimum-32-characters"
  SIGNUP_INVITE_CODE: "attendx-secret-invite-2026"
  ADMIN_EMAIL: "admin@attendx.local"
  ADMIN_PASSWORD: "<YOUR-ADMIN-PASSWORD>"
```

Apply the secret:
```bash
kubectl apply -f k8s/app/secret.yaml
```

Verify creation without exposing values:
```bash
kubectl get secret backend-secrets -n attendx
```

---

### Step 5.4: Apply Application ConfigMap
Update `FRONTEND_URL` in `k8s/app/configmap.yaml` with your Public IP or domain (e.g., `http://20.120.45.10`):

```bash
kubectl apply -f k8s/app/configmap.yaml
```

---

### Step 5.5: Deploy Backend Service and Deployment
Substitute your ACR login server and image tag in `k8s/app/deployment.yaml`, then apply:

```bash
sed -i.bak "s|\${ACR_LOGIN_SERVER}|attendxcr.azurecr.io|g; s|\${IMAGE_TAG}|v1|g" k8s/app/deployment.yaml
kubectl apply -f k8s/app/deployment.yaml
kubectl apply -f k8s/app/service.yaml
```

Check backend rollout status:
```bash
kubectl rollout status deployment/attendx-backend -n attendx
```

---

### Step 5.6: Deploy Frontend Service and Deployment
Substitute your ACR login server and image tag in `k8s/app/frontend-deployment.yaml`, then apply:

```bash
sed -i.bak "s|\${ACR_LOGIN_SERVER}|attendxcr.azurecr.io|g; s|\${IMAGE_TAG}|v1|g" k8s/app/frontend-deployment.yaml
kubectl apply -f k8s/app/frontend-deployment.yaml
kubectl apply -f k8s/app/frontend-service.yaml
```

Check frontend rollout status:
```bash
kubectl rollout status deployment/attendx-frontend -n attendx
```

---

### Step 5.7: Apply Ingress Routing
Apply the unified Ingress rule:
```bash
kubectl apply -f k8s/app/ingress.yaml
```

Verify Ingress status:
```bash
kubectl get ingress -n attendx
```

At this stage, browsing to `http://<EXTERNAL-IP>` opens the AttendX frontend, and `http://<EXTERNAL-IP>/api/health` opens the backend health endpoint.

---

### Step 5.8: Apply Autoscaling (HPA & VPA)
Apply the Horizontal Pod Autoscalers:
```bash
kubectl apply -f k8s/app/hpa.yaml
```

Check HPA target tracking:
```bash
kubectl get hpa -n attendx
```

Apply the Vertical Pod Autoscaler:
```bash
kubectl apply -f k8s/app/vpa.yaml
```

Check VPA status:
```bash
kubectl get vpa -n attendx
```

---

## 6. Native Monitoring & Observability Stack (Without Helm)

The monitoring stack is deployed directly from native manifests in `k8s/monitoring/`.

### Step 6.1: Create Monitoring Namespace
```bash
kubectl apply -f k8s/monitoring/namespace.yaml
```

---

### Step 6.2: Deploy Prometheus
The manifest `k8s/monitoring/prometheus.yaml` defines:
- A `ServiceAccount` and RBAC `ClusterRole` / `ClusterRoleBinding` granting read access to cluster nodes and pod metrics endpoints.
- A `ConfigMap` configuring Prometheus to scrape `attendx-backend-service.attendx.svc.cluster.local:8000/metrics` every 15 seconds.
- A `Deployment` running Prometheus with local storage.
- A `Service` exposing Prometheus internally on port 9090.

Apply Prometheus:
```bash
kubectl apply -f k8s/monitoring/prometheus.yaml
```

Check Prometheus rollout:
```bash
kubectl rollout status deployment/prometheus -n monitoring
```

---

### Step 6.3: Deploy Grafana
The manifest `k8s/monitoring/grafana.yaml` defines:
- A `ConfigMap` configuring the default Prometheus datasource pointing to `http://prometheus-service.monitoring.svc.cluster.local:9090`.
- A `Deployment` running Grafana with authentication configured.
- A `Service` exposing Grafana on port 80.

Apply Grafana:
```bash
kubectl apply -f k8s/monitoring/grafana.yaml
```

Check Grafana rollout:
```bash
kubectl rollout status deployment/grafana -n monitoring
```

---

### Step 6.4: Accessing Grafana & Prometheus Dashboards

Forward Grafana to your local workstation:
```bash
kubectl port-forward svc/grafana-service 3001:80 -n monitoring
```

Open `http://localhost:3001` in your browser:
- Username: `admin`
- Password: `adminpassword` (configured in `k8s/monitoring/grafana.yaml`)

Forward Prometheus to inspect raw metrics:
```bash
kubectl port-forward svc/prometheus-service 9090:9090 -n monitoring
```

Open `http://localhost:9090` in your browser.

---

### Step 6.5: Key PromQL Queries for AttendX

1. **API Request Throughput**:
```promql
sum(rate(http_requests_total[1m])) by (handler, status)
```

2. **P95 Latency for Face Scans**:
```promql
histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket{handler=~".*scan.*"}[5m])) by (le))
```

3. **Backend CPU Utilization**:
```promql
sum(rate(container_cpu_usage_seconds_total{namespace="attendx", container="backend"}[1m])) by (pod)
```

4. **Backend Memory Usage**:
```promql
sum(container_memory_working_set_bytes{namespace="attendx", container="backend"}) by (pod) / (1024 * 1024)
```

---

## 7. Production Operations Runbook

### Inspect Running Resources:
```bash
kubectl get pods -n attendx -o wide
kubectl get svc -n attendx
kubectl get ingress -n attendx
kubectl get hpa -n attendx
```

### View Live Application Logs:
```bash
kubectl logs -f deployment/attendx-backend -n attendx
kubectl logs -f deployment/attendx-frontend -n attendx
```

### Zero-Downtime Rolling Update:
```bash
docker build -t attendxcr.azurecr.io/attendx-backend:v2 ./backend
docker push attendxcr.azurecr.io/attendx-backend:v2
kubectl set image deployment/attendx-backend backend=attendxcr.azurecr.io/attendx-backend:v2 -n attendx
kubectl rollout status deployment/attendx-backend -n attendx
```

### Rollback on Incident:
```bash
kubectl rollout undo deployment/attendx-backend -n attendx
```

### Stop Cluster to Eliminate Compute Charges:
When testing or demo sessions conclude, stop node pool billing from the Azure Portal:
1. Open `aks-attendx-cluster` in the Azure Portal.
2. Click **Stop** on the top toolbar. Node VM charges stop immediately while cluster configuration and container images are preserved.
3. When ready to resume, click **Start**.
