# CLAWLOGIC Multi-Agent Coordination

> **Last Updated:** 2026-02-04
> **Status:** 🟡 Planning Phase

---

## Agent Roles & Ownership

| Agent ID | Domain | Owns | Dependencies |
|----------|--------|------|--------------|
| `agent-contracts` | Smart Contracts | `packages/contracts/*` | None |
| `agent-sdk` | TypeScript SDK | `packages/sdk/*` | `agent-contracts` (ABIs) |
| `agent-openclaw` | AI Agent | `apps/agent/*` | `agent-sdk` |
| `agent-frontend` | Terminal UI | `apps/web/*` | `agent-sdk` |

---

## Current Sprint

### Active Tasks

| Task | Owner | Status | Blockers |
|------|-------|--------|----------|
| `PredictionMarketHook.sol` | `agent-contracts` | 🔴 Not Started | - |
| `AgentRegistry.sol` | `agent-contracts` | 🔴 Not Started | - |
| SDK type generation | `agent-sdk` | 🔴 Not Started | Contracts ABI |
| OpenClaw tools | `agent-openclaw` | 🔴 Not Started | SDK |
| Terminal UI | `agent-frontend` | 🔴 Not Started | SDK |

### Blocked Queue
```
agent-sdk       → BLOCKED BY → agent-contracts (need ABIs)
agent-openclaw  → BLOCKED BY → agent-sdk (need typed client)
agent-frontend  → BLOCKED BY → agent-sdk (need hooks)
```

---

## Shared State

### Contract Addresses (Testnet)
```json
{
  "network": "base-sepolia",
  "chainId": 84532,
  "contracts": {
    "PoolManager": "TBD",
    "PredictionMarketHook": "TBD",
    "AgentRegistry": "TBD"
  }
}
```

### ENS Configuration
```json
{
  "parentName": "agent.eth",
  "registrar": "TBD",
  "resolver": "TBD"
}
```

---

## Communication Protocol

### Status Updates
Each agent updates this file when:
- ✅ Completing a task
- 🚧 Starting work on a task
- 🔴 Encountering a blocker
- 📤 Producing an artifact another agent needs

### Handoff Format
```markdown
## HANDOFF: [source-agent] → [target-agent]

**Artifact:** [path/to/artifact]
**Description:** [what it contains]
**Next Action:** [what target should do]
```

---

## Decision Log

| Date | Decision | Rationale | Owner |
|------|----------|-----------|-------|
| 2026-02-04 | Use V4 hooks for prediction markets | V4 can host binary outcomes directly | Team |
| 2026-02-04 | Arc as settlement layer | USDC gas, privacy | Team |
| 2026-02-04 | Skip CTF, use V4 pools | Simplifies architecture | Team |

---

## File Lock Protocol

To prevent merge conflicts:
1. **Before editing shared file:** Add lock entry below
2. **After editing:** Remove lock entry

### Active Locks
```
# No active locks
```

---

## Quick Links

- [Implementation Plan](./implementation_plan.md)
- [MVP Requirements](./mvp_requirements.md)
- [Technical Analysis](./clawlogic_technical_analysis.md)
