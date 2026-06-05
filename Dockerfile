# ─────────────────────────────────────────────────────────────────────────────
# Multi-stage build for the ArcadeQueue stack. Two final images:
#   - `api`    : the Express server
#   - `caddy`  : the Caddy reverse proxy + static file server
# Build with:  docker build --target api    -t arcadequeue-api    .
#              docker build --target caddy  -t arcadequeue-caddy  .
# Or both:     docker compose build
# ─────────────────────────────────────────────────────────────────────────────

# ── Stage 1: build the client ────────────────────────────────────────────────
# Produces /repo/client/dist with the Vite-built SPA. This is the only stage
# that needs the dev toolchain (Vite, React plugin, etc.).
#
# VITE_API_URL is a build-time variable (Vite bakes import.meta.env values
# into the bundle at build time). It defaults to https://api.porta137.com;
# override with `--build-arg VITE_API_URL=...` for staging or local prod runs.
FROM node:20-alpine AS client-build
ARG VITE_API_URL=https://api.porta137.com
ENV VITE_API_URL=$VITE_API_URL
WORKDIR /repo
# Copy the workspace plumbing first (root manifests + the two workspace
# manifests) so npm can resolve the workspaces before touching the source.
COPY package.json package-lock.json ./
COPY client/package.json ./client/
RUN npm ci --no-audit --no-fund --workspace=client --include-workspace-root=false
# Now copy the client source and build.
COPY client/ ./client/
RUN npm run build --workspace=client

# ── Stage 2: install production deps for the server ─────────────────────────
# Same workspace trick, but --omit=dev strips the test-only deps. Note: we
# install at the root so npm can resolve the workspace; only the server's
# production deps get laid down at /app/node_modules.
FROM node:20-alpine AS server-deps
WORKDIR /app
COPY package.json package-lock.json ./
# Copy the whole server workspace (manifest + source) so the api stage
# can pull both the resolved node_modules and the actual server files
# from this stage. Without the source, /app/server in this stage is just
# package.json, and the api image has no index.js to run.
COPY server/ ./server/
RUN npm ci --no-audit --no-fund --workspace=server --include-workspace-root=false

# ── Stage 3: final API image ────────────────────────────────────────────────
# Small, no dev tools. Runs as the unprivileged `node` user.
FROM node:20-alpine AS api
WORKDIR /app
ENV NODE_ENV=production
# Copy the resolved node_modules from the deps stage (includes the workspace
# symlink for `server/`).
COPY --from=server-deps /app/node_modules ./node_modules
COPY --from=server-deps /app/server ./server
# We also bake client/dist into the api image as a side-effect. We don't
# currently serve it from the API (Caddy does), but having it inline means
# the image is self-contained for any future "one-container" deployment.
COPY --from=client-build /repo/client/dist ./client/dist
EXPOSE 3001
USER node
CMD ["node", "server/index.js"]