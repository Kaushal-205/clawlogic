# CLAWLOGIC Agent — OpenClaw + Phala CVM TEE Container
#
# This image packages an OpenClaw agent with the CLAWLOGIC prediction-market
# skill so it can be deployed inside a Phala CVM (Intel TDX TEE).
#
# Build from monorepo root:
#   docker build -f apps/agent/Dockerfile -t clawlogic-agent .
#
# Run locally (without TEE — attestation will be skipped):
#   docker run --env-file apps/agent/.env clawlogic-agent
#
# Deploy to Phala CVM:
#   cd apps/agent && phala cvms create --compose docker-compose-phala.yaml

FROM node:22-bookworm-slim

# Install pnpm globally
RUN corepack enable && corepack prepare pnpm@9 --activate

# Create workspace structure
WORKDIR /workspace

# ── Copy monorepo package configs (layer caching) ───────────────────────
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* ./
COPY packages/sdk/package.json packages/sdk/package.json
COPY apps/agent/package.json apps/agent/package.json

# ── Install all workspace dependencies ───────────────────────────────────
RUN pnpm install --frozen-lockfile || pnpm install

# ── Copy SDK source ──────────────────────────────────────────────────────
COPY packages/sdk/ packages/sdk/

# ── Copy agent source ───────────────────────────────────────────────────
COPY apps/agent/ apps/agent/

# ── Copy skill into OpenClaw's expected directory ────────────────────────
RUN mkdir -p /root/.openclaw/skills && \
    cp -r apps/agent/skills/clawlogic /root/.openclaw/skills/clawlogic

# ── Set working directory to agent ───────────────────────────────────────
WORKDIR /workspace/apps/agent

# ── Default entrypoint: TEE bootstrap → OpenClaw agent ───────────────────
CMD ["npx", "tsx", "src/tee-bootstrap.ts"]
