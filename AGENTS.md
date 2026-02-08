# AGENTS.md - Working Guide For Human + AI Contributors

Last updated: 2026-02-07

## Mission

Build and operate `$CLAWLOGIC`: an agent-only prediction market protocol on Arbitrum Sepolia with:

- Uniswap v4 hook-gated market rails
- UMA OOV3 assertion and settlement
- ENS-linked agent identity
- ERC-8004 identity/reputation support
- LI.FI-assisted cross-chain funding
- Yellow Network intent negotiation

## Non-Negotiable Invariants

- Keep `AgentRegistry` gate enforced for market actions (no bypass paths).
- Preserve market lifecycle semantics (`initialize -> mint -> assert -> settle`).
- Keep intent-to-trade linkage when strict/live modes are enabled.
- Keep simulation fallback only for dev; use strict/live flags for demo proof.

## Current Runtime Model

Main orchestrator: `apps/agent/src/index.ts`

Execution flags:

- `STRICT_DEMO_MODE`
- `YELLOW_LIVE`
- `LIFI_LIVE`
- `CLOB_MATCH`
- `ONCHAIN_SETTLEMENT`
- `ENABLE_LIFI_PREFLIGHT`
- `DISABLE_FUNDING_GATE`

## Key Modules

- Contracts: `packages/contracts`
- SDK: `packages/sdk`
  - ENS helpers in `packages/sdk/src/client.ts`
  - LI.FI wrappers in `packages/sdk/src/bridge.ts`
- Agent app: `apps/agent`
  - Onboarding pipeline in `apps/agent/src/onboarding.ts`
  - Hybrid execution in `apps/agent/src/clob-matcher.ts` + orchestrator
  - Yellow negotiation in `apps/agent/src/yellow/`
  - LI.FI execution + persistence in `apps/agent/src/lifi-bridge.ts`
- Web app: `apps/web`
  - ENS-first identity and onboarding status in `apps/web/src/lib/client.ts`
  - Feed + execution/onboarding panels in `apps/web/src/app/page.tsx`

## Required Local Checks Before Merge

Run from repo root:

```bash
pnpm install --frozen-lockfile
pnpm sdk:check-web-dep
pnpm --filter @clawlogic/sdk build
pnpm --filter @clawlogic/sdk test
pnpm --filter @clawlogic/agent exec tsc --noEmit
pnpm --filter @clawlogic/web build
```

## End-to-End Verification Commands

Env bootstrap:

```bash
set -a; source apps/agent/.env; set +a
export AGENT_PRIVATE_KEY="$AGENT_ALPHA_PRIVATE_KEY"
```

ENS setup (idempotent):

```bash
pnpm --filter @clawlogic/agent setup:ens
```

Yellow standalone demo:

```bash
pnpm --filter @clawlogic/agent yellow:demo
```

Orchestrator smoke:

```bash
STRICT_DEMO_MODE=false YELLOW_LIVE=false LIFI_LIVE=false CLOB_MATCH=true ENABLE_LIFI_PREFLIGHT=true DISABLE_FUNDING_GATE=true ONCHAIN_SETTLEMENT=true pnpm --filter @clawlogic/agent start
```

Strict live proof:

```bash
STRICT_DEMO_MODE=true YELLOW_LIVE=true LIFI_LIVE=true CLOB_MATCH=true ENABLE_LIFI_PREFLIGHT=true DISABLE_FUNDING_GATE=false ONCHAIN_SETTLEMENT=true pnpm --filter @clawlogic/agent start
```

Artifacts:

- Yellow transcripts: `.clawlogic/yellow-negotiations.json`
- LI.FI records: `.clawlogic/lifi-bridges.json`
- Broadcast feed: `apps/web/public/agent-broadcasts.json`

## Release And Version Sync

- Publish SDK via tag: `sdk-vX.Y.Z` (workflow: `.github/workflows/publish-sdk.yml`)
- SDK/web dependency sync:
  - check: `pnpm sdk:check-web-dep`
  - update: `pnpm sdk:sync-web-dep`
  - automation PR workflow: `.github/workflows/sync-web-sdk.yml`

## Current Known Risk

- Yellow live auth can still fail depending on ClearNode challenge/signature behavior. Validate strict-live flow before demos/submission.
