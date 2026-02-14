# CLAWLOGIC Cross-Chain Configuration Switch Runbook

Last updated: 2026-02-11 (UTC)

## Purpose

Define a config-first chain switch process with no confidential chain naming leakage.

## Secrecy Rules

- Use neutral profile IDs only (example: `primary`, `confidential-a`).
- Do not include confidential chain names in branch names, commit messages, screenshots, or public docs.
- Keep confidential profile mapping in private operator storage, not in tracked public docs.

## Config-First Rules

- No code changes are required for a chain switch.
- Switches are performed by selecting the correct env/profile config.
- Contract address set and chain-specific RPC values must come from the selected profile.

## Required Profile Fields

Each profile must define these fields before switch execution:
- `AGENT_RPC_URL` (optional per-agent execution RPC override; if unset, shared/default RPC is used)
- `ARBITRUM_SEPOLIA_RPC_URL` (or profile-equivalent execution RPC)
- `AGENT_REGISTRY`
- `PREDICTION_MARKET_HOOK`
- `V4_POOL_MANAGER`
- `UMA_OOV3`
- `YELLOW_AUTH_CHAIN_ID`
- `YELLOW_AUTH_RPC_URL`
- `AGENT_ALPHA_PRIVATE_KEY`
- `AGENT_BETA_PRIVATE_KEY`
- `AGENT_PRIVATE_KEY` (active executor key)

If LI.FI live bridging is enabled, include required source-chain RPC env vars as well.

## Pre-Switch Checklist

- [ ] Current release/build is green for SDK, agent, and web checks.
- [ ] Target profile file is validated by a second operator.
- [ ] Pause/degrade plan is prepared (`docs/operations-runbook.md`).
- [ ] Canary plan is prepared (`docs/rollout-canary-checklist.md`).
- [ ] No confidential chain name appears in branch/work artifact naming.

## Switch Procedure

1. Freeze mutable activity.
- Stop active orchestrator process.
- If risk exists, pause mutable on-chain actions before switching.

2. Load target profile config.
- Source the profile env file and export runtime keys.

```bash
set -a; source <profile-env-file>; set +a
export AGENT_PRIVATE_KEY="$AGENT_ALPHA_PRIVATE_KEY"
```

3. Run readiness checks.
- `pnpm --filter @clawlogic/agent setup:ens` (idempotent, optional if ENS is in use)
- `pnpm --filter @clawlogic/agent yellow:demo`
- Start orchestrator in the intended rollout gate profile.

4. Validate invariants before promotion.
- AgentRegistry gate enforcement is intact.
- Lifecycle calls execute in correct order.
- Strict intent-trade linkage passes when strict/live profile is enabled.

5. Enter canary gate, not full rollout.
- Start at G1/G2 from `docs/rollout-canary-checklist.md`.
- Promote only after gate criteria are met.

## Rollback Procedure

1. Stop agent process and revert to previous known-good profile env file.
2. Re-run readiness checks and restart in safe/degraded mode.
3. If needed, pause on-chain mutable actions until stability is confirmed.
4. Record UTC timestamp, profile ID, trigger, and resolution note in operator log.

## Evidence To Capture Per Switch

- UTC switch start and end time.
- Source profile ID and target profile ID (neutral IDs only).
- Runtime mode flags used.
- Any failed tx hashes and resolution outcome.
- Canary gate reached and GO/NO-GO decision.
