/**
 * HiChat Enterprise OpenAPI 3.1 Specification
 * Complete documentation for REST APIs, Signal Protocol E2EE, Redis Presence, and Socket.IO Gateway.
 */

export const openApiSpec = {
  openapi: "3.1.0",
  info: {
    title: "HiChat Enterprise E2EE Messaging Platform API",
    version: "1.0.0",
    description: `
# HiChat Enterprise End-to-End Encrypted Platform

HiChat is a production-grade, horizontally scalable, end-to-end encrypted messaging engine designed for mission-critical enterprise communications.

---

## 🏛️ Architecture Highlights
* **Runtime**: Bun high-performance JavaScript/TypeScript engine.
* **Web Framework**: Hono lightweight, ultra-fast routing framework.
* **Database Layer**: PostgreSQL (Amazon RDS / Neon) with connection pooling, transactional integrity, and versioned migrations.
* **Distributed State & Presence**: Upstash Redis (Serverless Redis Cluster) with Sets, Hashes, and Pub/Sub for horizontal Socket.IO multi-container ECS scaling.
* **Realtime Gateway**: Socket.IO gateway with heartbeat TTL monitoring, send-order mailbox replay, and ack-timeout backoff scheduling.
* **E2EE Cryptography**: Signal Protocol (X3DH Key Agreement + Double Ratchet session ratcheting).
* **Validation & Security**: Centralized Zod validation, HTTP-only secure cookie refresh rotation, strict CORS whitelist, CSP/HSTS headers, and anti-CSRF token verification.

---

## 🔐 End-to-End Encryption (Signal Protocol)
HiChat implements the **Signal Protocol** for uncompromising cryptographic privacy:
1. **Identity Keys**: Curve25519 long-term identity key pairs generated on client devices.
2. **Signed PreKey**: Medium-term prekey signed by the user's identity private key.
3. **One-Time PreKeys**: Pool of single-use ephemeral keys replenished dynamically by clients.
4. **X3DH Handshake**: Initiating clients fetch the recipient's PreKey bundle to establish a shared secret without requiring both parties to be online simultaneously.
5. **Double Ratchet**: Continuous Diffie-Hellman ratchet and symmetric-key KDF ratchets advance per message, guaranteeing **Forward Secrecy** and **Post-Compromise Security (Break-in Recovery)**.

---

## 📬 Reliable Delivery Protocol (Mailbox Engine)
HiChat guarantees message delivery across flaky mobile networks and multi-container cluster nodes:
\`\`\`text
[Sender Device]
      │
      │ 1. send_direct_message (messageId, recipientId, ciphertext)
      ▼
[Hono / Socket Server]
      │
      │ 2. INSERT into 'mailbox' and 'message_deliveries' (status: 'queued')
      ▼
[PostgreSQL Database]
      │
      ├───────────────────────────────┬───────────────────────────────┐
      │ Recipient ONLINE in Redis     │ Recipient OFFLINE in Redis    │
      ▼                               ▼                               │
[Socket.IO Redis Adapter]    [Stored in Mailbox]                      │
      │                               │                               │
      │ 3. Dispatch Live              │ 3. On Connect / 'join'        │
      ▼                               ▼                               │
[Recipient Device]            [deliverPendingMailbox] ◄───────────────┘
      │                               │
      │ 4. Decrypt & ack_direct_message
      ▼
[Server: ACK Processor]
      │
      │ 5. DELETE from 'mailbox' & UPDATE 'message_deliveries' -> 'acknowledged'
      ▼
[Sender Device: message_status_update ('acknowledged')]
\`\`\`

### Delivery State Transitions:
* \`queued\`: Message securely recorded in PostgreSQL mailbox table; pending recipient delivery.
* \`delivered\`: Dispatched to recipient's connected socket connection; ACK timer running (10s window).
* \`acknowledged\`: Cryptographic receipt confirmed by recipient; mailbox row safely pruned.
* \`read\`: Recipient viewed the message; read receipt transmitted to sender.
* \`failed\`: Max retry attempts (5 retries: 0s, 5s, 15s, 30s, 60s) exhausted; dead-letter status recorded.

---

## 🔴 Distributed Redis Presence Engine
* **Cluster Presence**: Tracked in Redis Sets (\`presence:online_users\`) and Hashes (\`presence:user:{userId}\`).
* **Multi-Device Support**: Multi-device socket IDs tracked in Redis Sets (\`presence:user_sockets:{userId}\`). Users stay online until all active devices disconnect.
* **Heartbeat & TTL**: Clients transmit \`heartbeat\` events every 30s, refreshing 60s Redis TTLs. Expired presences are garbage-collected by the background scheduler.

---

## 🛡️ Authentication & Security Model
1. **Access Tokens**: Short-lived JWTs (15m expiry) passed in the \`Authorization: Bearer <token>\` header.
2. **Refresh Tokens**: Long-lived secure tokens stored in HTTP-only, SameSite=Strict cookies (\`hichat_refresh_token\`).
3. **Token Rotation**: Single-use refresh token rotation; reuse detection immediately invalidates all active sessions.
4. **Anti-CSRF Protection**: Mandatory \`X-CSRF-Token\` header required for state-changing cookie requests.

---

## ⚠️ Standard Error Response Catalog
All errors follow the uniform schema:
\`\`\`json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Validation failed",
    "requestId": "req_mtd4pl7i_eonyj8",
    "fields": {
      "email": "Invalid email format",
      "password": "Minimum length is 8"
    }
  }
}
\`\`\`

| Error Code | HTTP Status | Description |
| :--- | :---: | :--- |
| \`VALIDATION_ERROR\` | 400 | Request body, query, or path parameter failed Zod validation schema. |
| \`AUTHENTICATION_ERROR\` | 401 | Missing, invalid, or expired JWT / credentials. |
| \`REFRESH_TOKEN_REUSE_DETECTED\` | 401 | Stolen or reused refresh token detected; all sessions revoked. |
| \`AUTHORIZATION_ERROR\` | 403 | Insufficient permissions for the requested resource. |
| \`CSRF_ERROR\` | 403 | Missing or invalid anti-CSRF token on cookie-authenticated request. |
| \`NOT_FOUND\` | 404 | Targeted resource (room, user, key bundle) does not exist. |
| \`CONFLICT_ERROR\` | 409 | Resource already exists (e.g. username or email duplicate). |
| \`RATE_LIMIT_EXCEEDED\` | 429 | Exceeded request limit (100 req/min for HTTP, 5 msg/2s for sockets). |
| \`CRYPTO_ERROR\` | 400 | Signal protocol cryptographic failure or malformed key bundle. |
| \`DATABASE_ERROR\` | 500 | Transient or permanent database query execution error. |
| \`INTERNAL_SERVER_ERROR\` | 500 | Unhandled system exception. |
    `,
    contact: {
      name: "HiChat Core Architecture Team",
      email: "security@hichat.app",
      url: "https://hichat.app",
    },
    license: {
      name: "Proprietary / Enterprise E2EE",
      url: "https://hichat.app/license",
    },
  },
  servers: [
    {
      url: "http://localhost:3000",
      description: "Local Development Server",
    },
    {
      url: "https://staging-api.hichat.app",
      description: "AWS Staging ECS Cluster",
    },
    {
      url: "https://api.hichat.app",
      description: "AWS Production ECS Multi-Task Cluster",
    },
  ],
  tags: [
    { name: "Authentication", description: "JWT authentication, refresh token rotation, anti-CSRF tokens, and session management" },
    { name: "Users", description: "User profiles, public key discovery, online presence, and status management" },
    { name: "Rooms", description: "Public and private multi-user chat room management" },
    { name: "Messages", description: "End-to-end encrypted direct mailbox messages and room message history" },
    { name: "Signal Keys", description: "Signal Protocol X3DH PreKey bundles and cryptographic identity key management" },
    { name: "System", description: "Health diagnostics, connection pool status, Redis metrics, and system statistics" },
  ],
  paths: {
    "/api/auth/register": {
      post: {
        tags: ["Authentication"],
        summary: "Register new user",
        description: "Creates a new user account, stores password hash using bcrypt, issues initial JWT access token, and sets secure refresh token cookie.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/RegisterRequest" },
              example: {
                username: "alice_crypto",
                email: "alice@example.com",
                password: "SuperSecretPassword123!",
                publicKey: "BCdF56...identityPublicKeyBase64...",
                avatarUrl: "https://images.example.com/avatars/alice.png",
              },
            },
          },
        },
        responses: {
          200: {
            description: "Registration successful",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/LoginResponse" },
                example: {
                  success: true,
                  message: "Registration successful",
                  token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
                  accessToken: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
                  refreshToken: "rft_a1b2c3d4e5f6...",
                  csrfToken: "csrf_9876543210...",
                  user: {
                    id: "u_alice123",
                    username: "alice_crypto",
                    email: "alice@example.com",
                    publicKey: "BCdF56...identityPublicKeyBase64...",
                    status: "online",
                  },
                },
              },
            },
          },
          400: { $ref: "#/components/responses/ValidationErrorResponse" },
          409: { $ref: "#/components/responses/ConflictErrorResponse" },
          429: { $ref: "#/components/responses/RateLimitErrorResponse" },
          500: { $ref: "#/components/responses/InternalServerErrorResponse" },
        },
      },
    },
    "/api/auth/login": {
      post: {
        tags: ["Authentication"],
        summary: "Authenticate user",
        description: "Validates user credentials against PostgreSQL, generates JWT access token, and issues rotating refresh token cookie.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/LoginRequest" },
              example: {
                username: "alice_crypto",
                password: "SuperSecretPassword123!",
              },
            },
          },
        },
        responses: {
          200: {
            description: "Login successful",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/LoginResponse" },
                example: {
                  success: true,
                  message: "Login successful",
                  token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
                  accessToken: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
                  refreshToken: "rft_a1b2c3d4e5f6...",
                  csrfToken: "csrf_9876543210...",
                  user: {
                    id: "u_alice123",
                    username: "alice_crypto",
                    email: "alice@example.com",
                    status: "online",
                  },
                },
              },
            },
          },
          400: { $ref: "#/components/responses/ValidationErrorResponse" },
          401: { $ref: "#/components/responses/UnauthorizedErrorResponse" },
          429: { $ref: "#/components/responses/RateLimitErrorResponse" },
          500: { $ref: "#/components/responses/InternalServerErrorResponse" },
        },
      },
    },
    "/api/auth/refresh": {
      post: {
        tags: ["Authentication"],
        summary: "Rotate refresh token",
        description: "Rotates the HTTP-only refresh token, validates against family hierarchy in PostgreSQL, detects token reuse, and returns a new access token.",
        security: [{ cookieAuth: [] }],
        requestBody: {
          required: false,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  refreshToken: { type: "string", description: "Optional refresh token if cookies are not used" },
                },
              },
            },
          },
        },
        responses: {
          200: {
            description: "Token refreshed successfully",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/LoginResponse" },
              },
            },
          },
          401: { $ref: "#/components/responses/UnauthorizedErrorResponse" },
          403: { $ref: "#/components/responses/ForbiddenErrorResponse" },
          500: { $ref: "#/components/responses/InternalServerErrorResponse" },
        },
      },
    },
    "/api/auth/logout": {
      post: {
        tags: ["Authentication"],
        summary: "Logout current session",
        description: "Revokes current refresh token family in PostgreSQL and purges authentication cookies.",
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
        responses: {
          200: {
            description: "Logged out successfully",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean", example: true },
                    message: { type: "string", example: "Logged out successfully" },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/api/auth/logout-all": {
      post: {
        tags: ["Authentication"],
        summary: "Logout all active sessions",
        description: "Revokes all active refresh tokens for the authenticated user across all devices.",
        security: [{ bearerAuth: [] }],
        responses: {
          200: {
            description: "All sessions logged out successfully",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean", example: true },
                    message: { type: "string", example: "All sessions logged out successfully" },
                  },
                },
              },
            },
          },
          401: { $ref: "#/components/responses/UnauthorizedErrorResponse" },
        },
      },
    },
    "/api/auth/me": {
      get: {
        tags: ["Authentication"],
        summary: "Get current user identity",
        description: "Returns profile information for the authenticated user.",
        security: [{ bearerAuth: [] }],
        responses: {
          200: {
            description: "Authenticated user profile",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean", example: true },
                    user: { $ref: "#/components/schemas/User" },
                  },
                },
              },
            },
          },
          401: { $ref: "#/components/responses/UnauthorizedErrorResponse" },
        },
      },
    },
    "/api/auth/csrf": {
      get: {
        tags: ["Authentication"],
        summary: "Issue anti-CSRF token",
        description: "Generates a cryptographically random anti-CSRF token and sets the corresponding secure cookie.",
        responses: {
          200: {
            description: "Anti-CSRF token issued",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean", example: true },
                    csrfToken: { type: "string", example: "csrf_sec_9876543210abcdef" },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/api/users": {
      get: {
        tags: ["Users"],
        summary: "List all users and public keys",
        description: "Retrieves directory of all registered users and their identity public keys for E2EE discovery.",
        responses: {
          200: {
            description: "List of users",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    users: {
                      type: "array",
                      items: { $ref: "#/components/schemas/User" },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/api/rooms": {
      get: {
        tags: ["Rooms"],
        summary: "List chat rooms",
        description: "Retrieves all public chat rooms with active participant and message counts.",
        responses: {
          200: {
            description: "List of chat rooms",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean", example: true },
                    data: {
                      type: "array",
                      items: { $ref: "#/components/schemas/Room" },
                    },
                  },
                },
              },
            },
          },
        },
      },
      post: {
        tags: ["Rooms"],
        summary: "Create chat room",
        description: "Creates a new public or private chat room.",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["name"],
                properties: {
                  name: { type: "string", minLength: 2, maxLength: 50, example: "Security Architecture" },
                  description: { type: "string", maxLength: 200, example: "Discussions on Signal Protocol and cryptography" },
                  isPrivate: { type: "boolean", default: false, example: false },
                },
              },
            },
          },
        },
        responses: {
          201: {
            description: "Room created successfully",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean", example: true },
                    data: { $ref: "#/components/schemas/Room" },
                    message: { type: "string", example: "Room created successfully" },
                  },
                },
              },
            },
          },
          400: { $ref: "#/components/responses/ValidationErrorResponse" },
          401: { $ref: "#/components/responses/UnauthorizedErrorResponse" },
        },
      },
    },
    "/api/messages/{roomId}": {
      get: {
        tags: ["Messages"],
        summary: "Get room message history",
        description: "Fetches historical messages for a room with pagination support.",
        parameters: [
          {
            name: "roomId",
            in: "path",
            required: true,
            schema: { type: "string" },
            description: "Unique room identifier or room slug (e.g. 'general')",
          },
          {
            name: "limit",
            in: "query",
            required: false,
            schema: { type: "integer", minimum: 1, maximum: 200, default: 100 },
            description: "Maximum number of messages to return",
          },
          {
            name: "before",
            in: "query",
            required: false,
            schema: { type: "string" },
            description: "Cursor timestamp or message ID for pagination",
          },
        ],
        responses: {
          200: {
            description: "List of messages",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    messages: {
                      type: "array",
                      items: { $ref: "#/components/schemas/RoomMessage" },
                    },
                  },
                },
              },
            },
          },
          400: { $ref: "#/components/responses/ValidationErrorResponse" },
          404: { $ref: "#/components/responses/NotFoundErrorResponse" },
        },
      },
    },
    "/api/keys/bundle": {
      post: {
        tags: ["Signal Keys"],
        summary: "Upload initial Signal Protocol key bundle",
        description: "Uploads client's identity key, signed prekey with cryptographic signature, and initial pool of one-time prekeys for X3DH session establishment.",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/UploadKeyBundleRequest" },
              example: {
                deviceId: 1,
                registrationId: 1337,
                identityKey: "BCdF56...identityPublicKeyBase64...",
                signedPreKey: {
                  keyId: 1,
                  publicKey: "BXeA12...signedPreKeyBase64...",
                  signature: "SIG999...signatureBase64...",
                },
                oneTimePreKeys: [
                  { keyId: 100, publicKey: "BQk789...oneTimePreKey1..." },
                  { keyId: 101, publicKey: "BQk790...oneTimePreKey2..." },
                ],
              },
            },
          },
        },
        responses: {
          200: {
            description: "Key bundle uploaded successfully",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean", example: true },
                    message: { type: "string", example: "Key bundle uploaded successfully" },
                    deviceId: { type: "integer", example: 1 },
                    remainingPreKeys: { type: "integer", example: 25 },
                  },
                },
              },
            },
          },
          400: { $ref: "#/components/responses/ValidationErrorResponse" },
          401: { $ref: "#/components/responses/UnauthorizedErrorResponse" },
        },
      },
    },
    "/api/keys/prekeys": {
      post: {
        tags: ["Signal Keys"],
        summary: "Replenish one-time prekeys",
        description: "Appends additional single-use one-time prekeys to ensure uninterrupted X3DH handshake availability.",
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["oneTimePreKeys"],
                properties: {
                  deviceId: { type: "integer", default: 1, example: 1 },
                  oneTimePreKeys: {
                    type: "array",
                    items: { $ref: "#/components/schemas/OneTimePreKey" },
                  },
                },
              },
            },
          },
        },
        responses: {
          200: {
            description: "Prekeys replenished",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    success: { type: "boolean", example: true },
                    message: { type: "string", example: "50 one-time prekeys added" },
                    remainingPreKeys: { type: "integer", example: 75 },
                  },
                },
              },
            },
          },
          400: { $ref: "#/components/responses/ValidationErrorResponse" },
          401: { $ref: "#/components/responses/UnauthorizedErrorResponse" },
        },
      },
    },
    "/api/keys/bundle/{identifier}": {
      get: {
        tags: ["Signal Keys"],
        summary: "Fetch X3DH PreKey bundle for user",
        description: "Fetches target user's identity key, signed prekey, and pops a single one-time prekey to initiate an end-to-end encrypted session.",
        parameters: [
          {
            name: "identifier",
            in: "path",
            required: true,
            schema: { type: "string" },
            description: "User ID or username of the recipient",
          },
          {
            name: "deviceId",
            in: "query",
            required: false,
            schema: { type: "integer", default: 1 },
            description: "Target device ID (defaults to 1)",
          },
        ],
        responses: {
          200: {
            description: "Signal X3DH PreKey bundle",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/SignalBundle" },
              },
            },
          },
          404: { $ref: "#/components/responses/NotFoundErrorResponse" },
        },
      },
    },
    "/api/keys/count/{identifier}": {
      get: {
        tags: ["Signal Keys"],
        summary: "Get remaining prekeys count",
        description: "Returns the number of unused one-time prekeys available in the server pool for the specified user.",
        parameters: [
          {
            name: "identifier",
            in: "path",
            required: true,
            schema: { type: "string" },
            description: "User ID or username",
          },
          {
            name: "deviceId",
            in: "query",
            required: false,
            schema: { type: "integer", default: 1 },
            description: "Device ID",
          },
        ],
        responses: {
          200: {
            description: "Remaining prekeys count",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    userId: { type: "string", example: "u_alice123" },
                    deviceId: { type: "integer", example: 1 },
                    remainingPreKeys: { type: "integer", example: 42 },
                  },
                },
              },
            },
          },
          404: { $ref: "#/components/responses/NotFoundErrorResponse" },
        },
      },
    },
    "/health": {
      get: {
        tags: ["System"],
        summary: "System health check diagnostics",
        description: "Returns live connectivity status and latencies for PostgreSQL connection pool, Upstash Redis, and online presence metrics.",
        responses: {
          200: {
            description: "System healthy",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/HealthResponse" },
                example: {
                  status: "ok",
                  timestamp: "2026-08-28T18:00:00.000Z",
                  uptime: 3600.5,
                  memory: {
                    rss: 168472576,
                    heapTotal: 13095936,
                    heapUsed: 37713144,
                  },
                  database: {
                    healthy: true,
                    driver: "postgres",
                    latencyMs: 1.85,
                    pool: {
                      total: 5,
                      idle: 4,
                      waiting: 0,
                    },
                  },
                  redis: {
                    healthy: true,
                    latencyMs: 2.14,
                  },
                  presence: {
                    onlineUsers: 48,
                    trackedSockets: 62,
                  },
                },
              },
            },
          },
        },
      },
    },
    "/api/stats": {
      get: {
        tags: ["System"],
        summary: "System and platform statistics",
        description: "Aggregates registered user count, room count, active sessions, and message delivery stats.",
        responses: {
          200: {
            description: "System statistics",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/StatsResponse" },
              },
            },
          },
        },
      },
    },
  },
  components: {
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
        description: "Pass short-lived JWT access token in 'Authorization: Bearer <token>' header.",
      },
      cookieAuth: {
        type: "apiKey",
        in: "cookie",
        name: "hichat_refresh_token",
        description: "HTTP-only, SameSite=Strict rotating refresh token cookie.",
      },
      csrfToken: {
        type: "apiKey",
        in: "header",
        name: "x-csrf-token",
        description: "Anti-CSRF protection token header required for state-changing cookie requests.",
      },
    },
    schemas: {
      User: {
        type: "object",
        properties: {
          id: { type: "string", example: "u_alice123" },
          username: { type: "string", example: "alice_crypto" },
          email: { type: "string", format: "email", example: "alice@example.com" },
          publicKey: { type: "string", nullable: true, example: "BCdF56...identityPublicKeyBase64..." },
          avatarUrl: { type: "string", nullable: true, example: "https://images.example.com/avatars/alice.png" },
          status: { type: "string", enum: ["online", "offline", "away", "dnd"], example: "online" },
          customStatus: { type: "string", nullable: true, example: "Building E2EE Apps 🚀" },
          createdAt: { type: "string", format: "date-time", example: "2026-08-28T12:00:00.000Z" },
        },
      },
      Room: {
        type: "object",
        properties: {
          id: { type: "string", example: "general" },
          name: { type: "string", example: "General" },
          description: { type: "string", nullable: true, example: "Platform wide discussion" },
          isPrivate: { type: "boolean", example: false },
          createdBy: { type: "string", nullable: true, example: "u_alice123" },
          createdAt: { type: "string", format: "date-time", example: "2026-08-28T12:00:00.000Z" },
        },
      },
      RoomMessage: {
        type: "object",
        properties: {
          id: { type: "integer", example: 1042 },
          roomId: { type: "string", example: "general" },
          senderId: { type: "string", example: "u_alice123" },
          author: { type: "string", example: "alice_crypto" },
          payloads: {
            type: "object",
            description: "Encrypted ciphertext payloads per recipient or room session",
            example: { body: "ciphertext_blob_base64..." },
          },
          mediaUrl: { type: "string", nullable: true },
          fileName: { type: "string", nullable: true },
          fileSize: { type: "integer", nullable: true },
          createdAt: { type: "string", format: "date-time", example: "2026-08-28T12:30:00.000Z" },
        },
      },
      DirectMessage: {
        type: "object",
        properties: {
          messageId: { type: "string", example: "msg_987654321" },
          mailboxId: { type: "integer", example: 42 },
          senderId: { type: "string", example: "u_alice123" },
          senderUsername: { type: "string", example: "alice_crypto" },
          recipientId: { type: "string", example: "u_bob456" },
          ciphertext: { type: "string", example: "{\"type\":3,\"body\":\"ciphertext...\"}" },
          status: { type: "string", enum: ["queued", "delivered", "acknowledged", "read", "failed"], example: "delivered" },
          timestamp: { type: "string", format: "date-time", example: "2026-08-28T12:35:00.000Z" },
        },
      },
      SignalBundle: {
        type: "object",
        properties: {
          identityKey: { type: "string", example: "BCdF56...identityPublicKeyBase64..." },
          registrationId: { type: "integer", example: 1337 },
          deviceId: { type: "integer", example: 1 },
          signedPreKey: {
            type: "object",
            properties: {
              keyId: { type: "integer", example: 1 },
              publicKey: { type: "string", example: "BXeA12...signedPreKeyBase64..." },
              signature: { type: "string", example: "SIG999...signatureBase64..." },
            },
          },
          preKey: {
            type: "object",
            nullable: true,
            properties: {
              keyId: { type: "integer", example: 100 },
              publicKey: { type: "string", example: "BQk789...oneTimePreKey1..." },
            },
          },
          remainingPreKeys: { type: "integer", example: 24 },
        },
      },
      OneTimePreKey: {
        type: "object",
        required: ["keyId", "publicKey"],
        properties: {
          keyId: { type: "integer", example: 105 },
          publicKey: { type: "string", example: "BQk795...oneTimePreKey..." },
        },
      },
      UploadKeyBundleRequest: {
        type: "object",
        required: ["registrationId", "identityKey", "signedPreKey"],
        properties: {
          deviceId: { type: "integer", default: 1, example: 1 },
          registrationId: { type: "integer", example: 1337 },
          identityKey: { type: "string", example: "BCdF56...identityPublicKeyBase64..." },
          signedPreKey: {
            type: "object",
            required: ["keyId", "publicKey", "signature"],
            properties: {
              keyId: { type: "integer", example: 1 },
              publicKey: { type: "string", example: "BXeA12...signedPreKeyBase64..." },
              signature: { type: "string", example: "SIG999...signatureBase64..." },
            },
          },
          oneTimePreKeys: {
            type: "array",
            items: { $ref: "#/components/schemas/OneTimePreKey" },
          },
        },
      },
      RegisterRequest: {
        type: "object",
        required: ["username", "email", "password"],
        properties: {
          username: { type: "string", minLength: 3, maxLength: 30, example: "alice_crypto" },
          email: { type: "string", format: "email", example: "alice@example.com" },
          password: { type: "string", minLength: 8, maxLength: 128, example: "SuperSecretPassword123!" },
          publicKey: { type: "string", nullable: true, example: "BCdF56...identityPublicKeyBase64..." },
          avatarUrl: { type: "string", nullable: true, example: "https://images.example.com/avatars/alice.png" },
        },
      },
      LoginRequest: {
        type: "object",
        required: ["username", "password"],
        properties: {
          username: { type: "string", example: "alice_crypto" },
          password: { type: "string", example: "SuperSecretPassword123!" },
        },
      },
      LoginResponse: {
        type: "object",
        properties: {
          success: { type: "boolean", example: true },
          message: { type: "string", example: "Login successful" },
          token: { type: "string", example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." },
          accessToken: { type: "string", example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." },
          refreshToken: { type: "string", example: "rft_a1b2c3d4e5f6..." },
          csrfToken: { type: "string", example: "csrf_9876543210..." },
          user: { $ref: "#/components/schemas/User" },
        },
      },
      HealthResponse: {
        type: "object",
        properties: {
          status: { type: "string", example: "ok" },
          timestamp: { type: "string", format: "date-time", example: "2026-08-28T18:00:00.000Z" },
          uptime: { type: "number", example: 3600.5 },
          memory: {
            type: "object",
            properties: {
              rss: { type: "integer" },
              heapTotal: { type: "integer" },
              heapUsed: { type: "integer" },
            },
          },
          database: {
            type: "object",
            properties: {
              healthy: { type: "boolean", example: true },
              driver: { type: "string", example: "postgres" },
              latencyMs: { type: "number", example: 1.85 },
              pool: {
                type: "object",
                properties: {
                  total: { type: "integer", example: 5 },
                  idle: { type: "integer", example: 4 },
                  waiting: { type: "integer", example: 0 },
                },
              },
            },
          },
          redis: {
            type: "object",
            properties: {
              healthy: { type: "boolean", example: true },
              latencyMs: { type: "number", example: 2.14 },
            },
          },
          presence: {
            type: "object",
            properties: {
              onlineUsers: { type: "integer", example: 48 },
              trackedSockets: { type: "integer", example: 62 },
            },
          },
        },
      },
      StatsResponse: {
        type: "object",
        properties: {
          success: { type: "boolean", example: true },
          totalUsers: { type: "integer", example: 1250 },
          totalRooms: { type: "integer", example: 14 },
          onlineUsers: { type: "integer", example: 48 },
          totalMessages: { type: "integer", example: 54320 },
        },
      },
      ErrorResponse: {
        type: "object",
        properties: {
          success: { type: "boolean", example: false },
          error: {
            type: "object",
            properties: {
              code: { type: "string", example: "AUTHENTICATION_ERROR" },
              message: { type: "string", example: "Invalid or expired authentication token" },
              requestId: { type: "string", example: "req_mtd4pl7i_eonyj8" },
            },
          },
        },
      },
      ValidationError: {
        type: "object",
        properties: {
          success: { type: "boolean", example: false },
          error: {
            type: "object",
            properties: {
              code: { type: "string", example: "VALIDATION_ERROR" },
              message: { type: "string", example: "Validation failed" },
              requestId: { type: "string", example: "req_mtd4pl7i_eonyj8" },
              fields: {
                type: "object",
                additionalProperties: { type: "string" },
                example: {
                  email: "Invalid email format",
                  password: "Minimum length is 8",
                },
              },
            },
          },
        },
      },
    },
    responses: {
      ValidationErrorResponse: {
        description: "Bad Request - Schema validation error",
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/ValidationError" },
          },
        },
      },
      UnauthorizedErrorResponse: {
        description: "Unauthorized - Authentication required or invalid token",
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/ErrorResponse" },
          },
        },
      },
      ForbiddenErrorResponse: {
        description: "Forbidden - Insufficient permissions or CSRF token missing",
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/ErrorResponse" },
          },
        },
      },
      NotFoundErrorResponse: {
        description: "Not Found - Resource does not exist",
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/ErrorResponse" },
          },
        },
      },
      ConflictErrorResponse: {
        description: "Conflict - Unique resource constraint violated",
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/ErrorResponse" },
          },
        },
      },
      RateLimitErrorResponse: {
        description: "Too Many Requests - Rate limit threshold exceeded",
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/ErrorResponse" },
          },
        },
      },
      InternalServerErrorResponse: {
        description: "Internal Server Error - Unexpected server exception",
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/ErrorResponse" },
          },
        },
      },
    },
  },
};
