# HiChat Production Readiness Checklist

> **Pre-Flight Verification for Enterprise AWS Production Launch**  
> *Audit Target: Amazon ECS Fargate • ALB • RDS PostgreSQL • Upstash Redis • CloudFront*

---

## 1. 🏗️ Infrastructure & Networking

- [ ] **VPC Topology**: Multi-AZ VPC deployed across at least 3 Availability Zones with dedicated public, private application, and private database subnets.
- [ ] **Security Group Isolation**:
  - [ ] ALB security group accepts `80` and `443` only.
  - [ ] ECS security group accepts port `3000` strictly from the ALB security group.
  - [ ] RDS security group accepts port `5432` strictly from the ECS security group.
- [ ] **Application Load Balancer**:
  - [ ] HTTPS listener configured with modern TLS 1.3 policy (`ELBSecurityPolicy-TLS13-1-2-2021-06`).
  - [ ] Target group health checks configured to `/health` (success code: `200`, interval: `15s`).
  - [ ] WebSocket sticky sessions enabled (`stickiness.enabled=true`, type `lb_cookie`).
  - [ ] Deregistration delay (connection draining) set to `30s`.
- [ ] **CloudFront Global Edge**:
  - [ ] S3 Origin configured for static frontend assets with Origin Access Control (OAC).
  - [ ] Custom cache behaviors for `/api/*` and `/socket.io/*` forwarding to ALB without edge caching.
  - [ ] WebSocket headers (`Sec-WebSocket-Key`, `Sec-WebSocket-Version`, `Upgrade`, `Connection`) forwarded.

---

## 2. 🗄️ Database & Persistence Layer (PostgreSQL)

- [ ] **High Availability**: Amazon RDS PostgreSQL configured with Multi-AZ synchronous standby replication.
- [ ] **Connection Pooling**:
  - [ ] Singleton `pg.Pool` initialized with `max: 20` per container.
  - [ ] Idle connection timeout set to `30000ms`.
  - [ ] Connection timeout configured to `10000ms`.
- [ ] **Schema Migrations**:
  - [ ] All versioned migrations applied (`schema_migrations` tracking active).
  - [ ] Schema table validation checks run at startup (`initDb()`).
- [ ] **Backup & Disaster Recovery**:
  - [ ] Automated daily snapshots enabled with 30-day retention.
  - [ ] Point-in-Time Recovery (PITR) configured.
  - [ ] Deletion protection enabled on production instance.

---

## 3. 🔴 Distributed State & Realtime Gateway (Upstash Redis + Socket.IO)

- [ ] **Upstash Redis Cluster**:
  - [ ] Cluster connection verified via TLS (`rediss://`).
  - [ ] Exponential backoff reconnection enabled with max 5 retries.
  - [ ] `/health` endpoint reports Redis latency and health status.
- [ ] **Socket.IO Scaling**:
  - [ ] `@socket.io/redis-adapter` attached for cross-container message routing.
  - [ ] Distributed presence engine tracking online status in Redis Sets (`presence:online_users`).
  - [ ] Multi-device presence verified (`presence:user_sockets:{userId}`).
- [ ] **Mailbox Delivery Engine**:
  - [ ] Mailbox retry scheduler running at `5000ms` default interval.
  - [ ] In-flight concurrency mutex active (no overlapping sweeps).
  - [ ] Empty mailbox sweeps suppress verbose log noise.
  - [ ] ACK timers active (10s window) with exponential retry backoff.

---

## 4. 🔐 Security, Cryptography & Access Control

- [ ] **Zero Secret Leakage**:
  - [ ] No `.env` files committed to version control.
  - [ ] All sensitive credentials injected via AWS Secrets Manager ARNs in ECS task definition.
  - [ ] Pino logger configured with automatic credential masking for DB URLs, passwords, and tokens.
- [ ] **Authentication & Tokens**:
  - [ ] Short-lived JWT access tokens (15m expiry).
  - [ ] Secure HTTP-only, SameSite=Strict rotating refresh token cookies.
  - [ ] Refresh token reuse detection active (auto-revocation on breach attempt).
  - [ ] Cryptographic Anti-CSRF token verification active on state-changing cookie requests.
- [ ] **Signal Protocol Cryptography**:
  - [ ] Client-side key generation (Curve25519, X3DH, Double Ratchet).
  - [ ] Signed PreKey validation and cryptographic signature verification.
  - [ ] Dynamic One-Time PreKey replenishment monitoring.
- [ ] **Input Validation Everywhere**:
  - [ ] Strict Zod schemas active across all REST endpoints (Body, Query, Params).
  - [ ] Real-time Socket.IO payload validation active (`validateSocket`) preventing uncaught exceptions.

---

## 5. 📊 Monitoring, Observability & Alerting

- [ ] **CloudWatch Logging**:
  - [ ] Log group `/ecs/hichat-server` configured with 30-day retention.
  - [ ] Structured JSON logs emitted by Pino with `requestId` and `module` tags.
- [ ] **CloudWatch Alarms**:
  - [ ] Alarm on ALB `5XX` errors ($> 10$ in 2 minutes).
  - [ ] Alarm on Target Group Unhealthy Host Count ($\ge 1$).
  - [ ] Alarm on RDS CPU utilization ($> 80\%$).
- [ ] **Graceful Shutdown**:
  - [ ] ECS `stopTimeout` set to `30s`.
  - [ ] Application catches `SIGTERM` / `SIGINT` to gracefully drain sockets, stop schedulers, and close DB pool.

---

## 6. 🚀 CI/CD Pipeline & Deployment

- [ ] **GitHub Actions Workflow**:
  - [ ] Automated test suite runs on every pull request and push to `main`.
  - [ ] AWS authentication configured via secure IAM OIDC role assumption (zero static AWS keys).
  - [ ] Docker multi-stage image built and pushed to Amazon ECR with immutable commit SHA tags.
  - [ ] Rolling deployment to ECS service configured with `wait-for-service-stability: true`.
  - [ ] Minimum healthy percent set to `100%` (zero downtime).
