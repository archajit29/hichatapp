# ==============================================================================
# HiChat Enterprise Production Dockerfile
# Optimized Multi-Stage Build for Bun + Hono + Socket.IO + PostgreSQL + Redis
# ==============================================================================

# ------------------------------------------------------------------------------
# Stage 1: Dependency Installation & Build Cache
# ------------------------------------------------------------------------------
FROM oven/bun:1.3-alpine AS dependencies

WORKDIR /app

# Install build dependencies for native compilation if required
RUN apk add --no-cache python3 make g++

# Copy package manifests and lockfile
COPY package.json bun.lock* ./

# Install production dependencies with frozen lockfile for deterministic builds
RUN bun install --frozen-lockfile --production

# ------------------------------------------------------------------------------
# Stage 2: Production Minimal Runtime
# ------------------------------------------------------------------------------
FROM oven/bun:1.3-alpine AS runner

WORKDIR /app

# Install curl/wget for container health check diagnostics
RUN apk add --no-cache curl tzdata

# Set production environment flags
ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0

# Copy node_modules from dependency stage
COPY --from=dependencies /app/node_modules ./node_modules
COPY --from=dependencies /app/package.json ./package.json

# Copy application source files
COPY src ./src
COPY server.ts ./server.ts
COPY package.json ./package.json


# Ensure non-root ownership for enhanced container security
RUN chown -R bun:bun /app

# Switch to non-root bun user
USER bun

# Expose HTTP & WebSocket server port
EXPOSE 3000

# Container Health Check (targets /health endpoint with 5s timeout)
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

# Launch production server with proper signal forwarding for ECS SIGTERM handling
ENTRYPOINT ["bun", "run", "server.ts"]