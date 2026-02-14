# CLAWLOGIC Incident Response And Rollback Runbook

Last updated: 2026-02-11

## Scope

Applies to CLAWLOGIC launch operations on Arbitrum Sepolia.

Incident handling must preserve these invariants unless the protocol is explicitly paused:
- AgentRegistry gate remains enforced for market actions.
- Lifecycle semantics stay ordered: initialize -> mint -> assert -> settle.
- Intent-to-trade linkage remains enforced when `STRICT_DEMO_MODE=true` or `YELLOW_LIVE=true`.
- Simulation fallback is for degraded/dev mode, not strict live proof mode.

## Severity Levels

| Level | Trigger | Immediate target |
| --- | --- | --- |
| SEV-1 | Active safety/invariant risk, unauthorized behavior, or broad inability to execute/settle | Contain in <= 5 minutes |
| SEV-2 | Major degradation in one critical path (Yellow, LI.FI, matcher, or settlement delays) with no active safety breach | Stabilize in <= 30 minutes |
| SEV-3 | Limited failure, low blast radius, workaround exists, no safety impact | Fix in normal on-call flow |

## Detection Sources

1. Agent runtime logs
- Main process: `pnpm --filter @clawlogic/agent start`
- Capture stream: `pnpm --filter @clawlogic/agent start 2>&1 | tee /tmp/clawlogic-agent.log`
- Watch for:
  - `Orchestrator fatal error`
  - `Strict mode invariant failed`
  - `Funding gate blocked`
  - `Yellow Network negotiation failed`
  - `directional trade failed`
  - `Settlement Demo failed`

2. Chain transaction failures
- Failed/reverted tx hashes emitted by agent logs.
- Validate receipt status with explorer or RPC tooling.
- High signal: repeated reverts in `initializeMarket`, `mintOutcomeTokens`, `assertMarket`, `buyOutcomeToken`, `settleOutcomeTokens`.

3. Bridge failures (LI.FI)
- Runtime signals: `[Li.Fi]` lines containing `failed`, `insufficient`, `no route`, `unable to fetch`.
- Persistent records: `.clawlogic/lifi-bridges.json`.
- Quick check: `rg -n '"status": "failed"|source_receipt:failed' .clawlogic/lifi-bridges.json`

4. Matcher/intent anomalies
- Runtime signals from phase 3.5:
  - `[Execution] Mode: cpmm_fallback` spike in strict/live runs
  - `no cross` reason unexpectedly frequent
  - missing linked tx hash with strict linkage enabled
- Transcript evidence: `.clawlogic/yellow-negotiations.json`

## Triage Checklist (First 15 Minutes)

- [ ] Declare incident channel and assign Incident Commander (IC).
- [ ] Record UTC start time and initial detector.
- [ ] Classify SEV-1/2/3 using impact and invariant risk.
- [ ] Freeze blast radius:
  - SEV-1: trigger on-chain pause first.
  - SEV-2: disable affected live dependency flags.
- [ ] Snapshot evidence:
  - `/tmp/clawlogic-agent.log` (or active terminal capture)
  - `.clawlogic/yellow-negotiations.json`
  - `.clawlogic/lifi-bridges.json`
  - failing tx hashes
- [ ] Identify impacted lifecycle stage: initialize, mint, assert, or settle.
- [ ] Decide containment path: contract pause, feature-flag degrade, or full rollback.
- [ ] Post first status update (template below) within 10 minutes.

## Comms Template

Use this in the incident channel and stakeholder updates.

```text
[CLAWLOGIC INCIDENT]
Incident ID: INC-YYYYMMDD-##
Severity: SEV-1 | SEV-2 | SEV-3
Detected (UTC): <timestamp>
Detected by: <source>
Impact: <user/protocol impact>
Scope: <components, markets, chains>
Current status: Investigating | Contained | Recovering | Resolved
Containment actions: <pause/flags/rollback>
Key tx hashes: <comma-separated>
Next update (UTC): <timestamp>
IC: <name>
```

## Emergency Controls

### 1) Pause Guardian (On-chain kill switch)

`PredictionMarketHook.pause()` blocks mutable market actions. Use for SEV-1.

```bash
export RPC_URL="$ARBITRUM_SEPOLIA_RPC_URL"
export HOOK_ADDRESS="$(node -e "console.log(JSON.parse(require('fs').readFileSync('packages/contracts/deployments/arbitrum-sepolia.json','utf8')).contracts.PredictionMarketHook)")"
cast send "$HOOK_ADDRESS" "pause()" --private-key "$PAUSE_GUARDIAN_PRIVATE_KEY" --rpc-url "$RPC_URL"
cast call "$HOOK_ADDRESS" "s_paused()(bool)" --rpc-url "$RPC_URL"
```

Unpause only after recovery validation:

```bash
cast send "$HOOK_ADDRESS" "unpause()" --private-key "$PAUSE_GUARDIAN_PRIVATE_KEY" --rpc-url "$RPC_URL"
cast call "$HOOK_ADDRESS" "s_paused()(bool)" --rpc-url "$RPC_URL"
```

### 2) Feature Flags (Off-chain containment)

Set these before restarting `@clawlogic/agent`:

| Flag | Containment value | Effect |
| --- | --- | --- |
| `STRICT_DEMO_MODE` | `true` | Enforces strict intent/trade invariants |
| `YELLOW_LIVE` | `false` | Disables live ClearNode dependency; allows simulation fallback |
| `LIFI_LIVE` | `false` | Disables live bridge execution (quote-only path) |
| `CLOB_MATCH` | `false` | Forces CPMM fallback, bypasses CLOB match path |
| `ONCHAIN_SETTLEMENT` | `true` | Keep set explicitly (currently informational in orchestrator logging) |
| `ENABLE_LIFI_PREFLIGHT` | `false` | Skips LI.FI preflight path when LI.FI is unstable |
| `DISABLE_FUNDING_GATE` | `false` | Keep funding gate enforced during incidents |

Degraded safe start profile:

```bash
STRICT_DEMO_MODE=true \
YELLOW_LIVE=false \
LIFI_LIVE=false \
CLOB_MATCH=false \
ONCHAIN_SETTLEMENT=true \
ENABLE_LIFI_PREFLIGHT=false \
DISABLE_FUNDING_GATE=false \
pnpm --filter @clawlogic/agent start
```

## Rollback Playbooks

### A) Contract-side rollback

Use when on-chain safety is at risk or the active hook release is faulty.

1. Contain immediately.
- Pause hook (`pause()`).
- Stop agent write traffic (stop orchestrator jobs/workers).

2. Select rollback path.
- Path A (preferred): point runtime back to last known-good hook deployment.
- Path B: redeploy known-good hook release and update deployment reference.

3. Execute rollback.
- If redeploying hook:
  - `cd packages/contracts`
  - configure `PRIVATE_KEY`, `V4_POOL_MANAGER`, and RPC env vars
  - run: `forge script script/DeployHookOnly.s.sol:DeployHookOnlyScript --rpc-url "$ARBITRUM_SEPOLIA_RPC_URL" --broadcast`
- Update runtime deployment reference to known-good `PredictionMarketHook` address before restart.

4. Validate before unpause.
- Verify hook pause state and owner controls.
- Run smoke sequence in degraded mode.
- Confirm lifecycle calls work in order and AgentRegistry gate is still enforced.

5. Recover.
- Unpause only after successful smoke verification.
- Re-enable live flags one at a time with monitoring windows.

### B) Off-chain services rollback

Use when incident is in agent/web/sdk logic and contracts are healthy.

1. Stop affected services (`@clawlogic/agent`, web app workers/jobs).
2. Roll back to last known-good release for `apps/agent`, `packages/sdk`, and `apps/web`.
3. Reinstall/build critical packages:
- `pnpm install --frozen-lockfile`
- `pnpm --filter @clawlogic/sdk build`
- `pnpm --filter @clawlogic/agent exec tsc --noEmit`
- `pnpm --filter @clawlogic/web build`
4. Restart agent in degraded safe profile first.
5. Re-enable live dependencies in this order only after stable canary runs:
- `YELLOW_LIVE`
- `CLOB_MATCH`
- `LIFI_LIVE`

## Postmortem Template

```markdown
# CLAWLOGIC Postmortem: <INCIDENT_ID>

## Metadata
- Date (UTC):
- Severity:
- IC:
- Status: Resolved

## Summary
- What happened:
- User/protocol impact:
- Duration:

## Timeline (UTC)
| Time | Event | Owner |
| --- | --- | --- |
| hh:mm:ss | Detection | |
| hh:mm:ss | Containment | |
| hh:mm:ss | Recovery | |
| hh:mm:ss | Resolution | |

## Root Cause
- Primary cause:
- Trigger:
- Why safeguards did or did not stop it:

## Impact
- Affected lifecycle stages:
- Affected components (contracts/agent/yellow/lifi/matcher/web):
- Number of failed txs (if known):

## What Worked
- 

## What Failed
- 

## Corrective Actions
| Action | Owner | Due (UTC) | Status |
| --- | --- | --- | --- |
| | | | Open |

## Evidence
- Logs:
- Tx hashes:
- Yellow transcript path:
- LI.FI record path:
```
