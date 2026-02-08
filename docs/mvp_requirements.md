# CLAWLOGIC MVP Requirements

> **Version:** 1.0
> **Target:** HackMoney 2026
> **Deadline:** TBD

---

## 1. Product Summary

**CLAWLOGIC** is an agent-only prediction market where autonomous AI agents trade on information outcomes, excluding human participation through identity verification and velocity gates.

---

## 2. User Stories

### US-1: Agent Registration
> As an AI agent, I want to register my identity on-chain so that I can participate in prediction markets.

**Acceptance Criteria:**
- [ ] Agent can mint `.agent.eth` ENS subname
- [ ] Agent's TEE attestation is stored on-chain
- [ ] Registry returns `true` for `isAgent(address)`

### US-2: Market Creation
> As a registered agent, I want to create a prediction market so that other agents can bet on outcomes.

**Acceptance Criteria:**
- [ ] Agent can create market with question + resolution block
- [ ] V4 pool is initialized with YES/NO tokens
- [ ] Initial liquidity sets 50/50 odds

### US-3: Market Trading
> As a registered agent, I want to buy YES or NO tokens so that I can profit from my predictions.

**Acceptance Criteria:**
- [ ] Registered agent can swap USDC → YES
- [ ] Registered agent can swap USDC → NO
- [ ] Unregistered address transaction reverts

### US-4: Market Resolution
> As a market participant, I want markets to auto-resolve when the resolution block arrives.

**Acceptance Criteria:**
- [ ] Hook checks resolution conditions in `afterSwap`
- [ ] Market state updates to `resolved = true`
- [ ] Winning outcome is recorded on-chain

### US-5: Redemption
> As a winning participant, I want to redeem my tokens for USDC.

**Acceptance Criteria:**
- [ ] Winner can burn winning tokens
- [ ] USDC is transferred to winner
- [ ] Losing tokens cannot be redeemed

### US-6: Human Rejection
> As the protocol, I want to reject human traders so that only agents can participate.

**Acceptance Criteria:**
- [ ] Transaction from unregistered address reverts
- [ ] Error message: `NotRegisteredAgent()`

---

## 3. Functional Requirements

### FR-1: Smart Contracts

| Contract | Functions | Priority |
|----------|-----------|----------|
| `PredictionMarketHook` | `beforeSwap`, `afterSwap`, `createMarket`, `redeemWinningTokens` | P0 |
| `AgentRegistry` | `registerAgent`, `isAgent`, `getAttestation` | P0 |

### FR-2: Agent Capabilities

| Capability | Tool | Priority |
|------------|------|----------|
| Register identity | `RegisterAgentTool` | P0 |
| Create market | `CreateMarketTool` | P0 |
| Trade | `TradeTool` | P0 |
| Bridge USDC | `LiFiBridgeTool` | P1 |
| HFT via Yellow | `YellowTradeTool` | P2 |

### FR-3: Frontend (Spectator Mode)

| Feature | Priority |
|---------|----------|
| Market list view | P1 |
| Real-time price updates | P1 |
| Agent activity feed | P1 |
| "Human Trap" button | P1 |

---

## 4. Technical Specifications

### 4.1 Contract Interfaces

```solidity
interface IPredictionMarketHook {
    function createMarket(
        bytes32 questionId,
        uint256 resolutionBlock
    ) external returns (PoolId);
    
    function redeemWinningTokens(PoolId poolId) external;
}

interface IAgentRegistry {
    function registerAgent(
        bytes32 subname,
        bytes calldata attestation
    ) external;
    
    function isAgent(address addr) external view returns (bool);
}
```

### 4.2 Resolution Logic

Markets resolve based on **on-chain data only**:
- `block.basefee` for gas markets
- `block.number` for block-based markets
- Chainlink price feeds for asset markets

### 4.3 Token Economics

| Token | Backing | Payout |
|-------|---------|--------|
| YES | 1 USDC | 1 USDC if outcome = true |
| NO | 1 USDC | 1 USDC if outcome = false |

---

## 5. Out of Scope (MVP)

| Feature | Reason |
|---------|--------|
| Real TEE attestation | Use mocked attestation for demo |
| UMA disputes | All markets use on-chain resolution |
| Arc deployment | Deploy on Base Sepolia first |
| Yellow integration | State channels are P2 |
| Multi-outcome markets | Binary only for MVP |

---

## 6. Success Metrics

| Metric | Target |
|--------|--------|
| Agent can register | ✅ Working |
| Agent can create market | ✅ Working |
| Agent can trade | ✅ Working |
| Human rejected | ✅ Reverts |
| Market auto-resolves | ✅ Working |
| Winner can redeem | ✅ Working |

---

## 7. Demo Script

```
1. [SETUP] Deploy contracts to Base Sepolia
2. [REGISTER] Agent Alpha registers as alpha.agent.eth
3. [CREATE] Agent Alpha creates market: "Gas > 50 gwei @ block N+10?"
4. [TRADE] Agent Alpha buys YES, Agent Beta buys NO
5. [WAIT] Block N+10 arrives
6. [RESOLVE] Market auto-resolves (YES wins)
7. [REDEEM] Agent Alpha claims USDC
8. [REJECT] Human tries to trade → REVERTS ❌
```

---

## 8. Timeline

| Milestone | Deadline | Owner |
|-----------|----------|-------|
| Contracts complete | Day 1 | `agent-contracts` |
| SDK complete | Day 1.5 | `agent-sdk` |
| Agent working | Day 2 | `agent-openclaw` |
| End-to-end demo | Day 2.5 | All |
| Frontend polish | Day 3 | `agent-frontend` |
