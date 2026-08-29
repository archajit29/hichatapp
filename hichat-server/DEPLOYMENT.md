# HiChat Enterprise AWS Production Deployment Runbook

> **Target Environment**: Amazon ECS Fargate • Application Load Balancer (ALB) • Amazon CloudFront • Amazon RDS PostgreSQL • Upstash Redis • AWS Secrets Manager • CloudWatch

---

## 1. Production Architecture Topology

```mermaid
graph TD
    User["Web & Mobile Clients"]
    R53["Amazon Route 53 (DNS)<br/>api.hichat.app / chat.hichat.app"]
    CF["Amazon CloudFront CDN (Global Edge)"]
    S3["Amazon S3 Bucket<br/>(React Frontend Static Assets)"]
    ACM["AWS Certificate Manager (ACM)<br/>TLS 1.3 / Automated Renewal"]
    
    ALB["AWS Application Load Balancer (Public Subnets)<br/>• Port 443 HTTPS Listener<br/>• WebSocket Sticky Routing<br/>• Health Check: /health"]
    
    subgraph "AWS VPC (10.0.0.0/16)"
        subgraph "Private Application Subnets"
            ECS1["ECS Task 1 (Fargate)<br/>Bun + Hono + Socket.IO"]
            ECS2["ECS Task 2 (Fargate)<br/>Bun + Hono + Socket.IO"]
            ECS_N["ECS Task N (Auto-Scaled)"]
        end
        
        subgraph "Private Database Subnets"
            RDS_Primary["Amazon RDS PostgreSQL (Primary)"]
            RDS_Standby["Amazon RDS Standby (Multi-AZ)"]
        end
    end

    subgraph "External Cloud Infrastructure"
        Upstash["Upstash Redis Cluster (Serverless)<br/>• Socket.IO Redis Pub/Sub Adapter<br/>• Distributed Presence Engine"]
        Secrets["AWS Secrets Manager<br/>• DATABASE_URL<br/>• REDIS_URL<br/>• JWT_SECRET"]
        CW["Amazon CloudWatch Logs & Alarms<br/>/ecs/hichat-server"]
    end

    User -->|HTTPS / WSS| R53
    R53 --> CF
    CF -->|Static Assets /*| S3
    CF -->|API & Realtime (/api/*, /socket.io/*)| ALB
    ACM -.->|SSL Offloading| CF
    ACM -.->|SSL Offloading| ALB
    
    ALB -->|Target Group: Port 3000| ECS1
    ALB -->|Target Group: Port 3000| ECS2
    ALB -->|Target Group: Port 3000| ECS_N
    
    ECS1 <-->|Pub/Sub & Presence| Upstash
    ECS2 <-->|Pub/Sub & Presence| Upstash
    ECS1 -->|Connection Pool (SSL)| RDS_Primary
    ECS2 -->|Connection Pool (SSL)| RDS_Primary
    RDS_Primary -.->|Synchronous Replication| RDS_Standby
    
    ECS1 -.->|Task Execution Decryption| Secrets
    ECS1 -->|Logs & Metrics| CW
```

---

## 2. Step-by-Step AWS Infrastructure Provisioning

### Step 2.1: VPC & Security Group Architecture

1. **VPC CIDR**: `10.0.0.0/16` across 3 Availability Zones (e.g. `us-east-1a`, `us-east-1b`, `us-east-1c`).
2. **Subnets**:
   * 3 Public Subnets (`10.0.1.0/24`, `10.0.2.0/24`, `10.0.3.0/24`) with Internet Gateway for ALB.
   * 3 Private App Subnets (`10.0.10.0/24`, `10.0.11.0/24`, `10.0.12.0/24`) with NAT Gateways for ECS Tasks.
   * 3 Private DB Subnets (`10.0.20.0/24`, `10.0.21.0/24`, `10.0.22.0/24`) for Amazon RDS PostgreSQL.
3. **Security Groups**:
   * `sg-hichat-alb`: Ingress `80`, `443` from `0.0.0.0/0` (or CloudFront prefix list). Egress to `sg-hichat-ecs` on port `3000`.
   * `sg-hichat-ecs`: Ingress `3000` strictly from `sg-hichat-alb`. Egress to `0.0.0.0/0` (HTTPS) for Upstash Redis and `sg-hichat-rds` on `5432`.
   * `sg-hichat-rds`: Ingress `5432` strictly from `sg-hichat-ecs`.

---

### Step 2.2: Amazon RDS PostgreSQL Provisioning

```bash
# Provision Multi-AZ PostgreSQL 16 Instance
aws rds create-db-instance \
  --db-instance-identifier hichat-production-db \
  --db-instance-class db.t4g.medium \
  --engine postgres \
  --engine-version 16.2 \
  --allocated-storage 50 \
  --max-allocated-storage 500 \
  --storage-type gp3 \
  --multi-az \
  --master-username <DB_ADMIN_USER> \
  --master-user-password <DB_ADMIN_PASSWORD> \
  --vpc-security-group-ids sg-hichat-rds \
  --db-subnet-group-name hichat-db-subnet-group \
  --backup-retention-period 30 \
  --deletion-protection
```

---

### Step 2.3: AWS Secrets Manager Configuration

Store sensitive configuration in AWS Secrets Manager (do not place in plain text or commit to source control):

```bash
# 1. Database Connection URL
aws secretsmanager create-secret \
  --name "hichat/production/database-url" \
  --description "PostgreSQL RDS connection string" \
  --secret-string "postgresql://<DB_USER>:<DB_PASSWORD>@hichat-production-db.<AWS_REGION>.rds.amazonaws.com:5432/hichat_prod?sslmode=require"

# 2. Upstash Redis URL
aws secretsmanager create-secret \
  --name "hichat/production/redis-url" \
  --description "Upstash Redis cluster endpoint" \
  --secret-string "rediss://default:<UPSTASH_TOKEN>@<UPSTASH_HOST>.upstash.io:6379"

# 3. JWT Signing Secret
aws secretsmanager create-secret \
  --name "hichat/production/jwt-secret" \
  --description "Cryptographic JWT signing secret (64-byte random)" \
  --secret-string "<SECURE_64_CHAR_RANDOM_SECRET>"
```

---

### Step 2.4: Application Load Balancer & Target Group Configuration

1. **Target Group Settings**:
   * Target Type: `ip` (required for Fargate).
   * Protocol: `HTTP` on port `3000`.
   * Health Check Path: `/health`.
   * Health Check Interval: `15 seconds`.
   * Healthy Threshold: `2`, Unhealthy Threshold: `3`.
   * Timeout: `5 seconds`.
   * Success Codes: `200`.
2. **WebSocket Sticky Sessions**:
   ```bash
   aws elbv2 modify-target-group-attributes \
     --target-group-arn <TARGET_GROUP_ARN> \
     --attributes \
       Key=stickiness.enabled,Value=true \
       Key=stickiness.type,Value=lb_cookie \
       Key=stickiness.lb_cookie.duration_seconds,Value=86400 \
       Key=deregistration_delay.timeout_seconds,Value=30
   ```
3. **HTTPS Listener**:
   * Protocol: `HTTPS` on port `443`.
   * SSL Policy: `ELBSecurityPolicy-TLS13-1-2-2021-06`.
   * Default Action: Forward to Target Group.

---

### Step 2.5: CloudFront Global CDN & Routing Rules

Configure CloudFront Distribution with multiple origins:

| Cache Behavior / Path | Origin | Allowed Methods | Headers / Cookies Forwarding |
| :--- | :--- | :--- | :--- |
| `/*` (Default) | Amazon S3 Bucket (Frontend React SPA) | `GET, HEAD` | Cached at Edge; Gzip/Brotli enabled |
| `/api/*` | AWS ALB (`api.hichat.app`) | `GET, HEAD, OPTIONS, PUT, POST, PATCH, DELETE` | Caching Disabled; Forward All Headers & Cookies (`X-CSRF-Token`, `Authorization`) |
| `/socket.io/*` | AWS ALB (`api.hichat.app`) | `GET, HEAD, OPTIONS, PUT, POST, PATCH, DELETE` | Caching Disabled; WebSocket Upgrade Headers (`Sec-WebSocket-*`, `Upgrade`) |
| `/docs` & `/openapi.json` | AWS ALB (`api.hichat.app`) | `GET, HEAD` | Forward to Backend |

---

### Step 2.6: Amazon ECS Fargate Service & Auto-Scaling

1. **ECS Cluster**: `hichat-production-cluster`.
2. **Service Configuration**:
   * Launch Type: `FARGATE`.
   * Desired Count: `3` tasks (minimum).
   * Minimum Healthy Percent: `100%` (guarantees zero-downtime rolling deploys).
   * Maximum Percent: `200%`.
   * Stop Timeout: `30 seconds` (allows graceful Socket.IO drain).
3. **Target Tracking Auto-Scaling**:
   * Metric: `ECSServiceAverageCPUUtilization` at `70%`.
   * Metric: `ECSServiceAverageMemoryUtilization` at `75%`.
   * Minimum Tasks: `3`, Maximum Tasks: `20`.

---

## 3. Zero-Downtime Rolling Deployment Strategy

```
[Old Version: 3 Tasks (100%)]
       │
       ▼ (Deploy Initiated)
[Spawn New Version: +3 Tasks (200% Total)]
       │
       ▼ (Wait for /health 200 OK across new tasks)
[ALB Registers New Tasks & Begins Routing New Connections]
       │
       ▼ (Deregister Old Tasks: 30s Connection Drain)
[Old Tasks receive SIGTERM -> Close Schedulers -> Drain Sockets -> Close Pool]
       │
       ▼ (Deploy Completed)
[New Version: 3 Tasks (100%)]
```

---

## 4. Monitoring, CloudWatch Alarms & Observability

### CloudWatch Log Group
* Group Name: `/ecs/hichat-server`
* Retention: `30 days` (streamed to S3 / OpenSearch for long-term audit).

### Essential CloudWatch Alarms

| Alarm Name | Metric / Threshold | Action |
| :--- | :--- | :--- |
| `HiChat-High-5XX-Rate` | `HTTPCode_Target_5XX_Count > 10` for 2 mins | PagerDuty / Slack Alert |
| `HiChat-Unhealthy-Host-Count` | `UnHealthyHostCount >= 1` for 1 min | Trigger Auto-Recovery |
| `HiChat-DB-High-CPU` | RDS `CPUUtilization > 80%` for 5 mins | DB Scaling Alert |
| `HiChat-Redis-Latency` | `/health` `redis.latencyMs > 50ms` | Network/Cache Alert |

---

## 5. Disaster Recovery Runbook

* **PostgreSQL Automated Snapshots**: Daily automated snapshots with 30-day retention + point-in-time recovery (PITR) to within 5 minutes.
* **Multi-AZ Failover**: Amazon RDS automatically fails over to the standby instance within 60 seconds with zero manual DNS changes.
* **Drain & Restart**: If an ECS container crashes, Fargate automatically provisions a replacement container in $<30$ seconds.
