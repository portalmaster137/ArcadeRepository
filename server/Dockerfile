# ── Stage 1: deps ────────────────────────────────────────────────────────────
FROM node:20-alpine AS deps

WORKDIR /app

COPY package.json package-lock.json* ./

# Install only production dependencies
RUN npm install --omit=dev --frozen-lockfile 2>/dev/null || npm install --omit=dev

# ── Stage 2: production image ─────────────────────────────────────────────────
FROM node:20-alpine AS runner

# Security: run as non-root user
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

WORKDIR /app

# Copy production deps from deps stage
COPY --from=deps /app/node_modules ./node_modules

# Copy application source
COPY --chown=appuser:appgroup . .

# Remove dev-only files
RUN rm -f .env.example setup-firebase.js

USER appuser

EXPOSE 3001

ENV NODE_ENV=production

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3001/auth/me || exit 1

CMD ["node", "index.js"]
