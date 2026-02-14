# CLAWLOGIC Progressive Rollout And Canary Checklist

Last updated: 2026-02-11 (UTC)

## Scope

Operator checklist for staged rollout with explicit GO/NO-GO gates.

Always preserve these invariants:
- AgentRegistry gate remains enforced for market actions.
- Lifecycle ordering remains `initialize -> mint -> assert -> settle`.
- Intent-to-trade linkage remains enforced when strict/live mode is enabled.
- Simulation fallback is only for dev/degraded operation.

## Rollout Gates

| Gate | Blast radius | Required mode | Promote when | Stop and roll back when |
| --- | --- | --- | --- | --- |
| G0: Preflight | 0 users | static checks only | Build/tests pass and deployment config is validated | Any invariant check fails |
| G1: Internal dry run | internal operators only | `STRICT_DEMO_MODE=true`, live deps off | 2 consecutive clean end-to-end runs | Any revert on market lifecycle calls |
| G2: Canary market | 1 low-risk market, 1-2 agents | strict mode on, enable one live dependency at a time | 60 minutes stable, no unresolved failed txs | Invariant breach, repeated failed txs, or missing settlement path |
| G3: Expanded canary | <= 25% of rollout cohort | strict mode on, intended live profile | 24 hours stable and incident-free | Error-rate spike, bridge instability, or unresolved negotiation failures |
| G4: General rollout | full cohort | full target profile | Explicit operator GO sign-off | Any SEV-1/SEV-2 trigger |

## Gate Checklist

### G0 preflight

- [ ] `pnpm install --frozen-lockfile`
- [ ] `pnpm sdk:check-web-dep`
- [ ] `pnpm --filter @clawlogic/sdk build`
- [ ] `pnpm --filter @clawlogic/sdk test`
- [ ] `pnpm --filter @clawlogic/agent exec tsc --noEmit`
- [ ] `pnpm --filter @clawlogic/web build`
- [ ] Active env/profile points to expected contract addresses and RPC endpoints.

### G1 internal dry run

- [ ] Start agent with strict mode and live dependencies disabled.
- [ ] Complete one full lifecycle (`initialize -> mint -> assert -> settle`).
- [ ] Confirm no AgentRegistry bypass path appears in logs or tx traces.
- [ ] Confirm artifacts written:
  - `.clawlogic/yellow-negotiations.json`
  - `.clawlogic/lifi-bridges.json`
  - `apps/web/public/agent-broadcasts.json`

### G2 canary market

- [ ] Select single canary market with low operational risk.
- [ ] Enable live dependencies gradually (Yellow, then CLOB, then LI.FI if needed).
- [ ] Monitor failed tx count, settlement latency, and negotiation success rate.
- [ ] Keep pause guardian and rollback operator available during full canary window.

### G3 expanded canary

- [ ] Increase cohort only after G2 stability window is complete.
- [ ] Keep strict mode and funding gate enabled.
- [ ] Re-check funding, onboarding, trading, and settlement readiness every release.
- [ ] Confirm no unresolved SEV-1/SEV-2 incidents.

### G4 general rollout

- [ ] Record GO decision with UTC timestamp and operator name.
- [ ] Keep incident runbook owner on-call for first 24 hours.
- [ ] Continue publishing operational artifacts for auditability.

## Minimal Canary Runtime Profiles

Use these as baseline starting points and override only what the current gate permits.

```bash
# Internal dry run (G1)
STRICT_DEMO_MODE=true YELLOW_LIVE=false LIFI_LIVE=false CLOB_MATCH=false ENABLE_LIFI_PREFLIGHT=false DISABLE_FUNDING_GATE=false ONCHAIN_SETTLEMENT=true pnpm --filter @clawlogic/agent start

# Strict live canary (G2+)
STRICT_DEMO_MODE=true YELLOW_LIVE=true LIFI_LIVE=true CLOB_MATCH=true ENABLE_LIFI_PREFLIGHT=true DISABLE_FUNDING_GATE=false ONCHAIN_SETTLEMENT=true pnpm --filter @clawlogic/agent start
```

## Abort Criteria (Immediate)

Trigger pause/degrade immediately when any of the following occurs:
- AgentRegistry gating is not provably enforced.
- Lifecycle stage ordering breaks or settlement cannot complete.
- Strict intent-to-trade linkage fails under strict/live mode.
- Repeated unresolved tx failures across canary window.

Then follow `docs/operations-runbook.md` containment and rollback steps.
