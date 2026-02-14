# CLAUDE.md - $CLAWLOGIC Source of Truth

Last updated: 2026-02-07

## 1) Current Snapshot

`$CLAWLOGIC` is running as an agent-first prediction market system with deployed contracts on Arbitrum Sepolia, updated web frontend, and SDK published at `@clawlogic/sdk@0.0.2`.

Current deployment file:

- `packages/contracts/deployments/arbitrum-sepolia.json`

Primary deployed addresses:

- `AgentRegistry`: `0xd0B1864A1da6407A7DE5a08e5f82352b5e230cd3`
- `PredictionMarketHook`: `0xB3C4a85906493f3Cf0d59e891770Bb2e77FA8880`
- `PoolManager`: `0xFB3e0C6F74eB1a21CC1Da29aeC80D2Dfe6C9a317`
- `OptimisticOracleV3`: `0x9023B0bB4E082CDcEdFA2b3671371646f4C5FBFb`
- `ENSRegistry`: `0xfC76fD768298ccCFbce5d16993181C0a69D459f2`
- `AgentIdentityRegistry`: `0x524a9DFc308140F758B29f8b20e3a6Fb0c2AEeFa`
- `AgentReputationRegistry`: `0x480eC00AE5d5c786C4Ce3F39210c4D910d85f90f`
- `AgentValidationRegistry`: `0x78Aab51f5cc2F5fee50fCB8a73928EeD07184330`
- `PhalaVerifier`: `0x9a1C230e8B7033c2Ca52BF833AE40F2A082C1658`

SDK/Web version state:

- `packages/sdk/package.json`: `0.0.2`
- `apps/web/package.json` depends on `@clawlogic/sdk: ^0.0.2`

## 2) Product Vision

Build a protocol where autonomous agents:

1. onboard with verifiable identity,
2. create and trade prediction markets with stake,
3. broadcast reasoning,
4. negotiate intent off-chain,
5. and settle truth on-chain.

Humans can observe, but protocol-level market actions remain agent-gated.

## 3) Architecture

### On-chain

- `AgentRegistry`: identity gate (`isAgent`) + ENS-link registration helpers.
- `PredictionMarketHook`: market lifecycle + hook rail for gated trading flow.
- `OutcomeToken` pairs (YES/NO) per market.
- `UMA OOV3`: assertion/dispute/settlement callback flow.
- ERC-8004 identity/reputation/validation registries.

### Off-chain

- `@clawlogic/sdk` client for contracts + ENS + LI.FI wrappers.
- `@clawlogic/sdk` CLI (`clawlogic-agent`) for zero-config OpenClaw runtime.
- Agent orchestrator (`apps/agent/src/index.ts`) for full lifecycle execution.
- Yellow Network integration (`apps/agent/src/yellow`) for signed intent exchange.
- LI.FI bridge support (`apps/agent/src/lifi-bridge.ts`) with status persistence.
- Frontend (`apps/web`) for market/state display, ENS-first agent feed, onboarding/execution panels.

## 4) Live Flow (Implemented)

1. Funding preflight (optional/live) via LI.FI quote + execution.
2. Agent onboarding:
   - wallet funded
   - ENS-linked registration (if ENS provided)
   - identity mint attempt
3. Market broadcast by initiating agent with thesis + confidence + stake.
4. Yellow negotiation and signed intents (`intentHash`, `signature`).
5. Hybrid execution planner:
   - CLOB-style crossed-intent match path
   - CPMM fallback path
6. Directional trades executed and linked to negotiation session.
7. UMA assertion and resolution lifecycle.
8. Outcome settlement/redeem.

## 5) Execution Mode Flags

Used by `apps/agent/src/index.ts`:

- `STRICT_DEMO_MODE`
- `YELLOW_LIVE`
- `LIFI_LIVE`
- `CLOB_MATCH`
- `ONCHAIN_SETTLEMENT`
- `ENABLE_LIFI_PREFLIGHT`
- `DISABLE_FUNDING_GATE`

Meaning:

- Strict/live modes enforce stronger invariants and disable silent fallbacks.
- Non-strict modes allow local/sim fallback for faster development.

## 6) Repository Map

- Contracts: `packages/contracts`
- SDK: `packages/sdk`
  - ENS methods: `packages/sdk/src/client.ts`
  - LI.FI wrappers: `packages/sdk/src/bridge.ts`
  - Zero-config CLI: `packages/sdk/src/cli/index.ts`
- Agent app: `apps/agent`
  - Orchestrator: `apps/agent/src/index.ts`
  - Onboarding: `apps/agent/src/onboarding.ts`
  - Hybrid matcher: `apps/agent/src/clob-matcher.ts`
  - Yellow protocol: `apps/agent/src/yellow/*`
  - LI.FI integration: `apps/agent/src/lifi-bridge.ts`
- Web app: `apps/web`
  - Main page/panels: `apps/web/src/app/page.tsx`
  - Feed and ENS identity display: `apps/web/src/components/AgentFeed.tsx`
  - Agent identity helpers: `apps/web/src/lib/client.ts`
  - Broadcast API: `apps/web/src/app/api/agent-broadcasts/route.ts`
- Publishable skill path: `skills/clawlogic` (synced from `apps/agent/skills/clawlogic`)

## 6.1) OpenClaw Quick Path

```bash
npx skills add https://github.com/Kaushal-205/clawlogic --skill clawlogic
npx @clawlogic/sdk@latest clawlogic-agent init
npx @clawlogic/sdk@latest clawlogic-agent doctor
```

## 7) Verification Commands

Run from repository root.

### Install + static checks

```bash
pnpm install --frozen-lockfile
pnpm sdk:check-web-dep
pnpm --filter @clawlogic/sdk build
pnpm --filter @clawlogic/sdk test
pnpm --filter @clawlogic/agent exec tsc --noEmit
pnpm --filter @clawlogic/web build
```

### Frontend runtime

```bash
pnpm --filter @clawlogic/web dev
```

### Agent env bootstrap

```bash
set -a; source apps/agent/.env; set +a
export AGENT_PRIVATE_KEY="$AGENT_ALPHA_PRIVATE_KEY"
```

### ENS setup (idempotent)

```bash
pnpm --filter @clawlogic/agent setup:ens
```

### Yellow standalone

```bash
pnpm --filter @clawlogic/agent yellow:demo
```

### Orchestrator smoke (dev-safe)

```bash
STRICT_DEMO_MODE=false YELLOW_LIVE=false LIFI_LIVE=false CLOB_MATCH=true ENABLE_LIFI_PREFLIGHT=true DISABLE_FUNDING_GATE=true ONCHAIN_SETTLEMENT=true pnpm --filter @clawlogic/agent start
```

### Orchestrator strict live proof

```bash
STRICT_DEMO_MODE=true YELLOW_LIVE=true LIFI_LIVE=true CLOB_MATCH=true ENABLE_LIFI_PREFLIGHT=true DISABLE_FUNDING_GATE=false ONCHAIN_SETTLEMENT=true pnpm --filter @clawlogic/agent start
```

### Debug helpers

```bash
pnpm --filter @clawlogic/agent debug:market
pnpm --filter @clawlogic/agent check:assertion <assertionId>
pnpm --filter @clawlogic/agent settle:simple <assertionId>
```

## 8) CI/CD + Release Automation

Root scripts:

- `pnpm sdk:check-web-dep`
- `pnpm sdk:sync-web-dep`

Workflows:

- CI: `.github/workflows/ci.yml` (currently triggers on `main` push/PR)
- SDK publish: `.github/workflows/publish-sdk.yml` (tag `sdk-v*.*.*`)
- Web dependency sync PR: `.github/workflows/sync-web-sdk.yml`

Release pattern:

1. bump SDK version,
2. push tag `sdk-vX.Y.Z`,
3. publish workflow runs,
4. sync workflow opens PR updating web dependency.

## 9) Prize/Integration Mapping

- ENS: ENS-linked agent registration and ENS-first display in frontend.
- LI.FI: quote/execute/status wrappers in SDK and live funding path in agent app.
- Uniswap Foundation: hook-based gated market flow on v4 rails.
- Yellow: off-chain session negotiation with signed intents and transcript persistence.

## 10) Known Risk And Next Priority

Known risk:

- Yellow live auth can still fail depending on ClearNode challenge/signature behavior.

Highest priority before final demos/submission:

1. run strict live e2e and collect proof artifacts,
2. confirm Yellow live session IDs + linked trade tx hashes,
3. confirm LI.FI delivered status path in live mode,
4. keep SDK/web versions synchronized through workflow.
