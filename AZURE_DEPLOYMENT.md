# AttendX Azure Cloud & Kubernetes Deployment Guide

This guide details the complete production deployment of AttendX on Microsoft Azure using the Azure Portal (Web UI), Docker, Azure Kubernetes Service (AKS), Ingress, Horizontal Pod Autoscaler (HPA), Vertical Pod Autoscaler (VPA), Prometheus, and Grafana.

---

## 1. Cloud Architecture & Azure Services

```
                       Internet Traffic / End Users
                                     |
                                     v
                       [ Azure Public IP / DNS ]
                                     |
                                     v
                       [ NGINX Ingress Controller ]
                         (SSL/TLS via Cert-Manager)
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
       |  (HPA: 2 - 5 Replicas)|           |  (HPA: 2 - 10 Replicas)
       +-----------------------+           +-----------------------+
                                                       |
                                     +-----------------+-----------------+
                                     |                                   |
                                     v                                   v
                        +-------------------------+         +-------------------------+
                        |  Azure Container Reg.   |         | Azure Database for      |
                        |      (ACR Basic)        |         | PostgreSQL Flexible     |
                        | (attendxcr.azurecr.io)  |         | (pgvector enabled)      |
                        +-------------------------+         +-------------------------+
                                                                         ^
                                                                         | Scrapes /metrics
                                                            +-------------------------+
                                                            |  Prometheus & Grafana   |
                                                            |  (Namespace: monitoring)|
                                                            +-------------------------+
```

### Azure Services Utilized:
1. **Azure Resource Group (`rg-attendx-prod`)**: Logical grouping container for all provisioned cloud resources.
2. **Azure Container Registry (`attendxcr`)**: Private Docker image registry storing signed container images.
3. **Azure Kubernetes Service (`aks-attendx-cluster`)**: Managed Kubernetes cluster managing high availability, pod scheduling, and health reconciliation.
4. **Azure Database for PostgreSQL Flexible Server (`psql-attendx-prod`)**: Fully managed relational database with the `pgvector` extension enabled for biometric embedding searches.
5. **Azure Public IP & Standard Load Balancer**: Automatically provisioned by the NGINX Ingress Controller for ingress routing.

---

## 2. Step-by-Step Azure Portal (UI) Provisioning

### Step 2.1: Create the Resource Group
1. Open the [Azure Portal](https://portal.azure.com) in your browser.
2. In the top search bar, type `Resource groups` and select it.
3. Click **+ Create**.
4. Fill in:
   - **Subscription**: Select your active Azure subscription.
   - **Resource group**: `rg-attendx-prod`
   - **Region**: `East US` (or your nearest preferred region).
5. Click **Review + create** -> **Create**.

---

### Step 2.2: Create Azure Container Registry (ACR)
1. Search for `Container registries` in the search bar and select it.
2. Click **+ Create**.
3. Fill in the **Basics** tab:
   - **Resource group**: `rg-attendx-prod`
   - **Registry name**: `attendxcr` (must be globally unique, all lowercase alphanumeric).
   - **Location**: `East US`.
   - **SKU**: `Basic` (cost-effective for production images).
4. Click **Review + create** -> **Create**.
5. Once deployment completes, click **Go to resource**.
6. Under **Settings** -> select **Access keys**.
7. Toggle **Admin user** to **Enabled**. Note down:
   - Login server: `attendxcr.azurecr.io`
   - Username: `attendxcr`
   - password: `<password-1>`

---

### Step 2.3: Create Azure Database for PostgreSQL Flexible Server
1. Search for `Azure Database for PostgreSQL flexible servers` and select it.
2. Click **+ Create**.
3. Fill in the **Basics** tab:
   - **Resource group**: `rg-attendx-prod`
   - **Server name**: `psql-attendx-prod` (globally unique).
   - **Region**: `East US`.
   - **PostgreSQL version**: `16`.
   - **Workload type**: `Development` or `Small/Medium size production`.
   - **Compute + storage**: Click *Configure server* -> select **Burstable**, **B1ms** or **B2s** (1-2 vCPU, 2-4 GiB RAM), 32 GiB storage.
   - **Authentication**: `PostgreSQL authentication only`.
   - **Admin username**: `attendxadmin`
   - **Password**: `<secure-database-password>`
4. In the **Networking** tab:
   - **Connectivity method**: `Public access (allowed IP addresses)`.
   - Check the box: **Allow public access from any Azure service within Azure to this server**.
   - Click **+ Add current client IP address** so you can connect from your local workstation if needed.
5. Click **Review + create** -> **Create**.
6. Once created, go to the database resource in the Azure Portal:
   - In the left menu under **Settings**, select **Server parameters**.
   - Search for `azure.extensions`.
   - Check `VECTOR` in the multi-select dropdown.
   - Click **Save** at the top.
   - In the left menu under **Settings**, select **Databases** -> click **+ Add** -> Database name: `attendx_db` -> **Save**.

---

### Step 2.4: Create Azure Kubernetes Service (AKS) Cluster
1. Search for `Kubernetes services` and select it.
2. Click **+ Create** -> select **Create a Kubernetes cluster**.
3. **Basics Tab**:
   - **Resource group**: `rg-attendx-prod`
   - **Cluster preset configuration**: `Dev/Test` or `Cost-optimised`.
   - **Kubernetes cluster name**: `aks-attendx-cluster`
   - **Region**: `East US`.
   - **Kubernetes version**: Select the latest stable default (e.g., 1.28 or 1.29).
   - **Node pools**:
     - Agent pool name: `nodepool1`
     - Node size: Click *Choose a size* -> Select **Standard_B2s** (2 vCPU, 4 GiB RAM) or **Standard_D2s_v5** (2 vCPU, 8 GiB RAM).
     - Scale method: `Manual` with Node count: `2` (or `Autoscale` 1 to 3).
4. **Networking Tab**:
   - **Network configuration**: `Kubenet` (simpler, cost-efficient).
5. **Integrations Tab**:
   - **Container registry**: Click the dropdown and select **attendxcr** (this automatically sets up the `AcrPull` managed identity role assignment without needing manual secrets).
6. **Monitoring Tab**:
   - Azure Container Insights can be disabled if using the custom Prometheus & Grafana stack described below.
7. Click **Review + create** -> **Create**. (Provisioning takes ~5-8 minutes).

---

### Step 2.5: Connect to the Cluster
Once the AKS cluster is provisioned:
1. Open the cluster in the Azure Portal.
2. Click the **Connect** button on the overview toolbar.
3. You can either use the **Azure Cloud Shell** (built into the portal toolbar at the top `>_`) or run locally:

```bash
az login
az account set --subscription "<YOUR_SUBSCRIPTION_ID>"
az aks get-credentials --resource-group rg-attendx-prod --name aks-attendx-cluster
```

Verify the connection:
```bash
kubectl get nodes
```

---

## 3. Containerization & Registry Push

Run from the root of the repository on your workstation or CI/CD runner:

### 3.1 Authenticate with ACR
```bash
docker login attendxcr.azurecr.io -u attendxcr -p <ACR_PASSWORD>
```

### 3.2 Build & Push Backend Container
```bash
docker build -t attendxcr.azurecr.io/attendx-backend:v1 ./backend
docker push attendxcr.azurecr.io/attendx-backend:v1
```

### 3.3 Build & Push Frontend Container
```bash
docker build -t attendxcr.azurecr.io/attendx-frontend:v1 ./frontend
docker push attendxcr.azurecr.io/attendx-frontend:v1
```

---

## 4. Kubernetes Manifests

Create a directory named `k8s-deploy/` or execute the manifests below sequentially:

### 4.1 Namespaces (`00-namespaces.yaml`)
```yaml
apiVersion: v1
kind: Namespace
metadata:
  name: attendx
---
apiVersion: v1
kind: Namespace
metadata:
  name: monitoring
```

Apply:
```bash
kubectl apply -f 00-namespaces.yaml
```

---

### 4.2 Database & Application Secrets (`01-secrets.yaml`)
```yaml
apiVersion: v1
kind: Secret
metadata:
  name: attendx-secrets
  namespace: attendx
type: Opaque
stringData:
  DATABASE_URL: "postgresql://attendxadmin:<SECURE_PASSWORD>@psql-attendx-prod.postgres.database.azure.com:5432/attendx_db"
  JWT_SECRET_KEY: "prod-attendx-super-secret-key-change-in-production-2026"
  SIGNUP_INVITE_CODE: "attendx-secret-invite-2026"
```

Apply:
```bash
kubectl apply -f 01-secrets.yaml
```

---

### 4.3 Backend Deployment & Service (`02-backend.yaml`)
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: attendx-backend
  namespace: attendx
  labels:
    app: attendx-backend
spec:
  replicas: 2
  selector:
    matchLabels:
      app: attendx-backend
  template:
    metadata:
      labels:
        app: attendx-backend
      annotations:
        prometheus.io/scrape: "true"
        prometheus.io/path: "/metrics"
        prometheus.io/port: "8000"
    spec:
      containers:
        - name: backend
          image: attendxcr.azurecr.io/attendx-backend:v1
          imagePullPolicy: IfNotPresent
          ports:
            - containerPort: 8000
          env:
            - name: SUPABASE_DB_URL
              valueFrom:
                secretKeyRef:
                  name: attendx-secrets
                  key: DATABASE_URL
            - name: JWT_SECRET_KEY
              valueFrom:
                secretKeyRef:
                  name: attendx-secrets
                  key: JWT_SECRET_KEY
            - name: SIGNUP_INVITE_CODE
              valueFrom:
                secretKeyRef:
                  name: attendx-secrets
                  key: SIGNUP_INVITE_CODE
          resources:
            requests:
              cpu: "300m"
              memory: "512Mi"
            limits:
              cpu: "1500m"
              memory: "1536Mi"
          livenessProbe:
            httpGet:
              path: /api/v1/health/live
              port: 8000
            initialDelaySeconds: 20
            periodSeconds: 15
          readinessProbe:
            httpGet:
              path: /api/v1/health/ready
              port: 8000
            initialDelaySeconds: 15
            periodSeconds: 10
---
apiVersion: v1
kind: Service
metadata:
  name: attendx-backend-svc
  namespace: attendx
  labels:
    app: attendx-backend
spec:
  type: ClusterIP
  selector:
    app: attendx-backend
  ports:
    - name: http
      port: 8000
      targetPort: 8000
```

Apply:
```bash
kubectl apply -f 02-backend.yaml
```

---

### 4.4 Frontend Deployment & Service (`03-frontend.yaml`)
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: attendx-frontend
  namespace: attendx
  labels:
    app: attendx-frontend
spec:
  replicas: 2
  selector:
    matchLabels:
      app: attendx-frontend
  template:
    metadata:
      labels:
        app: attendx-frontend
    spec:
      containers:
        - name: frontend
          image: attendxcr.azurecr.io/attendx-frontend:v1
          imagePullPolicy: IfNotPresent
          ports:
            - containerPort: 3000
          env:
            - name: BACKEND_INTERNAL_URL
              value: "http://attendx-backend-svc.attendx.svc.cluster.local:8000"
          resources:
            requests:
              cpu: "100m"
              memory: "128Mi"
            limits:
              cpu: "500m"
              memory: "512Mi"
          readinessProbe:
            httpGet:
              path: /
              port: 3000
            initialDelaySeconds: 10
            periodSeconds: 10
---
apiVersion: v1
kind: Service
metadata:
  name: attendx-frontend-svc
  namespace: attendx
  labels:
    app: attendx-frontend
spec:
  type: ClusterIP
  selector:
    app: attendx-frontend
  ports:
    - name: http
      port: 3000
      targetPort: 3000
```

Apply:
```bash
kubectl apply -f 03-frontend.yaml
```

---

## 5. Ingress Controller & Routing

### 5.1 Install NGINX Ingress Controller via Helm
```bash
helm repo add ingress-nginx https://kubernetes.github.io/ingress-nginx
helm repo update

helm install ingress-nginx ingress-nginx/ingress-nginx \
  --namespace ingress-nginx \
  --create-namespace \
  --set controller.service.annotations."service\.beta\.kubernetes\.io/azure-load-balancer-health-probe-request-path"=/healthz
```

Retrieve the public LoadBalancer IP:
```bash
kubectl get svc -n ingress-nginx ingress-nginx-controller -w
```

### 5.2 Configure Ingress Routing (`04-ingress.yaml`)
```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: attendx-ingress
  namespace: attendx
  annotations:
    kubernetes.io/ingress.class: nginx
    nginx.ingress.kubernetes.io/proxy-body-size: "15m"
    nginx.ingress.kubernetes.io/proxy-read-timeout: "120"
    nginx.ingress.kubernetes.io/proxy-send-timeout: "120"
spec:
  rules:
    - http:
        paths:
          - path: /api
            pathType: Prefix
            backend:
              service:
                name: attendx-backend-svc
                port:
                  number: 8000
          - path: /
            pathType: Prefix
            backend:
              service:
                name: attendx-frontend-svc
                port:
                  number: 3000
```

Apply:
```bash
kubectl apply -f 04-ingress.yaml
```

---

## 6. Autoscaling: HPA & VPA

### 6.1 Horizontal Pod Autoscaler (HPA)
The Horizontal Pod Autoscaler monitors CPU and memory utilization reported by the Kubernetes `metrics-server` (built into AKS) and automatically scales pods up during heavy camera scanning bursts.

#### HPA Manifest (`05-hpa.yaml`)
```yaml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: attendx-backend-hpa
  namespace: attendx
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: attendx-backend
  minReplicas: 2
  maxReplicas: 8
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70
    - type: Resource
      resource:
        name: memory
        target:
          type: Utilization
          averageUtilization: 80
  behavior:
    scaleUp:
      stabilizationWindowSeconds: 0
      policies:
        - type: Percent
          value: 100
          periodSeconds: 15
    scaleDown:
      stabilizationWindowSeconds: 300
      policies:
        - type: Percent
          value: 20
          periodSeconds: 60
---
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: attendx-frontend-hpa
  namespace: attendx
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: attendx-frontend
  minReplicas: 2
  maxReplicas: 5
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 75
```

Apply:
```bash
kubectl apply -f 05-hpa.yaml
```

View HPA status:
```bash
kubectl get hpa -n attendx
```

CLI quick-scale command:
```bash
kubectl autoscale deployment attendx-backend --cpu-percent=70 --min=2 --max=8 -n attendx
```

---

### 6.2 Vertical Pod Autoscaler (VPA)
While HPA scales the number of replicas, VPA recommends and adjusts the CPU/memory request and limit sizes for computer vision pods that experience variable memory demand depending on image resolutions.

#### Install VPA CRDs:
```bash
git clone https://github.com/kubernetes/autoscaler.git
cd autoscaler/vertical-pod-autoscaler
./hack/vpa-up.sh
cd ../..
rm -rf autoscaler
```

#### VPA Manifest (`06-vpa.yaml`)
```yaml
apiVersion: autoscaling.k8s.io/v1
kind: VerticalPodAutoscaler
metadata:
  name: attendx-backend-vpa
  namespace: attendx
spec:
  targetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: attendx-backend
  updatePolicy:
    updateMode: "Initial"
  resourcePolicy:
    containerPolicies:
      - containerName: backend
        minAllowed:
          cpu: "250m"
          memory: "384Mi"
        maxAllowed:
          cpu: "2000m"
          memory: "2048Mi"
        controlledResources: ["cpu", "memory"]
```

Apply:
```bash
kubectl apply -f 06-vpa.yaml
```

View VPA recommendations:
```bash
kubectl describe vpa attendx-backend-vpa -n attendx
```

---

## 7. Monitoring & Observability (Prometheus + Grafana)

### 7.1 Install Kube-Prometheus Stack via Helm
```bash
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm repo update

helm install prometheus-stack prometheus-community/kube-prometheus-stack \
  --namespace monitoring \
  --set grafana.adminPassword="<SECURE_GRAFANA_PASSWORD>" \
  --set prometheus.prometheusSpec.serviceMonitorSelectorNilUsesHelmValues=false
```

### 7.2 ServiceMonitor for FastAPI (`07-servicemonitor.yaml`)
```yaml
apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: attendx-backend-monitor
  namespace: monitoring
  labels:
    release: prometheus-stack
spec:
  selector:
    matchLabels:
      app: attendx-backend
  namespaceSelector:
    matchNames:
      - attendx
  endpoints:
    - port: http
      path: /metrics
      interval: 15s
```

Apply:
```bash
kubectl apply -f 07-servicemonitor.yaml
```

### 7.3 Accessing Grafana Dashboard
Access Grafana locally using secure port forwarding:
```bash
kubectl port-forward svc/prometheus-stack-grafana 3001:80 -n monitoring
```
Open `http://localhost:3001` in your browser:
- Username: `admin`
- Password: `<SECURE_GRAFANA_PASSWORD>`

### 7.4 Essential PromQL Queries for AttendX
Create a custom Grafana dashboard with the following metrics:

1. **HTTP Request Rate (Throughput per endpoint)**:
   ```promql
   sum(rate(http_requests_total{job="attendx-backend-monitor"}[1m])) by (handler, status)
   ```

2. **95th Percentile API Latency (p95 response time)**:
   ```promql
   histogram_quantile(0.95, sum(rate(http_request_duration_seconds_bucket[5m])) by (le, handler))
   ```

3. **Face Scan Error Rate (Failed scans vs successes)**:
   ```promql
   sum(rate(http_requests_total{handler=~".*scan.*", status=~"4..|5.."}[1m])) / sum(rate(http_requests_total{handler=~".*scan.*"}[1m])) * 100
   ```

4. **Pod CPU Utilization vs Limits**:
   ```promql
   sum(rate(container_cpu_usage_seconds_total{namespace="attendx", container="backend"}[1m])) by (pod)
   ```

5. **Pod Memory Usage**:
   ```promql
   sum(container_memory_working_set_bytes{namespace="attendx", container="backend"}) by (pod) / (1024 * 1024)
   ```

---

## 8. Operational DevOps Runbook & Management

### Useful `kubectl` Management Commands:
```bash
kubectl get pods -n attendx -o wide
kubectl get svc -n attendx
kubectl get ingress -n attendx
kubectl get hpa -n attendx

kubectl logs -f deployment/attendx-backend -n attendx
kubectl logs -f deployment/attendx-frontend -n attendx

kubectl exec -it deployment/attendx-backend -n attendx -- sh

kubectl rollout restart deployment/attendx-backend -n attendx
kubectl rollout restart deployment/attendx-frontend -n attendx

kubectl rollout status deployment/attendx-backend -n attendx
kubectl rollout undo deployment/attendx-backend -n attendx
```

### Cost Optimization (Stopping AKS when not in use):
To avoid compute costs when the university demo or laboratory session is finished:
1. Open the AKS cluster in the Azure Portal.
2. Click **Stop** on the top command bar.
3. Node compute charges cease immediately while configuration and storage are preserved.
4. When ready to resume, click **Start**.
