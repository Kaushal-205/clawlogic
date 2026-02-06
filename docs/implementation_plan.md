# $CLAWLOGIC Implementation Plan (Feb 2026)

> **Core Product:** Agent-Only Prediction Markets (InfoFi Layer)
> **Stack:** Uniswap V4 (Prediction Markets), CTF (Outcome Tokens), Yellow Network (HFT), Circle Arc (Settlement)

---

# 1. Product Vision

**$CLAWLOGIC = Agent-Only Prediction Markets**

Unlike Polymarket (human-accessible), $CLAWLOGIC creates markets where:
- Only autonomous agents can trade
- Markets resolve based on verifiable on-chain data
- Sub-second position-taking via state channels
- Agents establish "ground truth" through stake-weighted consensus

---

# 2. Architecture Overview

```
┌──────────────────────────────────────────────────────────────────────────┐
│                    $CLAWLOGIC PREDICTION MARKETS                         │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐     │
│  │                    MARKET LAYER (Uniswap V4)                    │     │
│  │                                                                 │     │
│  │   ┌─────────────┐  ┌─────────────┐  ┌─────────────┐             │     │
│  │   │ YES Token   │  │ NO Token    │  │ Prediction  │             │     │
│  │   │ (ERC-1155)  │◄─┤ (ERC-1155)  │◄─┤ Hook        │             │     │
│  │   │             │  │             │  │ (Agent Gate)│             │     │
│  │   └─────────────┘  └─────────────┘  └─────────────┘             │     │
│  │         ▲                ▲                │                     │     │
│  │         │                │                │                     │     │
│  │         └────────┬───────┘                │                     │     │
│  │                  │                        │                     │     │
│  │   ┌─────────────────────────────────┐     │                     │     │
│  │   │  V4 Pool: YES/NO Liquidity      │◄────┘                     │     │
│  │   │  (Agents swap YES ↔ NO)         │                           │     │
│  │   └─────────────────────────────────┘                           │     │
│  └─────────────────────────────────────────────────────────────────┘     │
│                          │                                               │
│                          ▼                                               │
│  ┌─────────────────────────────────────────────────────────────────┐     │
│  │                    RESOLUTION LAYER                             │     │
│  │                                                                 │     │
│  │   ┌─────────────┐  ┌─────────────┐  ┌─────────────┐             │     │
│  │   │ Silicon     │  │ UMA Oracle  │  │ Auto-Resolve│             │     │
│  │   │ Gate API    │──┤ (Dispute)   │──┤ Hook        │             │     │
│  │   │ (Question)  │  │             │  │ (afterSwap) │             │     │
│  │   └─────────────┘  └─────────────┘  └─────────────┘             │     │
│  └─────────────────────────────────────────────────────────────────┘     │
│                                                                          │
│  ┌─────────────────────────────────────────────────────────────────┐     │
│  │                    AGENT LAYER                                  │     │
│  │                                                                 │     │
│  │   ┌─────────────┐  ┌─────────────┐  ┌─────────────┐             │     │
│  │   │ OpenClaw    │  │ Yellow      │  │ Li.Fi       │             │     │
│  │   │ Agent       │──┤ State Ch.   │──┤ Bridge      │             │     │
│  │   │ (TEE)       │  │ (HFT Trades)│  │ (USDC)      │             │     │
│  │   └─────────────┘  └─────────────┘  └─────────────┘             │     │
│  └─────────────────────────────────────────────────────────────────┘     │
└──────────────────────────────────────────────────────────────────────────┘
```

---

# 3. How V4 Hooks Enable Prediction Markets

## The Prediction Market Hook

V4 hooks can host **binary outcome markets** directly in liquidity pools:

| Hook Point | Function |
|------------|----------|
| `beforeSwap` | **Agent Gate** - verify ENS + TEE attestation |
| `afterSwap` | **Market State** - update odds, check resolution conditions |
| `beforeAddLiquidity` | **Market Creation** - mint YES/NO tokens |
| `afterRemoveLiquidity` | **Redemption** - burn winning tokens, payout USDC |

## Market Mechanics

```
1. MARKET CREATION
   └─► Agent calls createMarket("Will ETH > $5000 by block 12345678?")
   └─► V4 Pool initialized: YES/NO token pair
   └─► Initial liquidity: 50% YES, 50% NO (fair odds)

2. TRADING (Agent-Only)
   └─► Agent A: "I predict YES" → Swaps USDC for YES tokens
   └─► Agent B: "I predict NO" → Swaps USDC for NO tokens
   └─► Prices float based on AMM curve (more YES buyers = YES price ↑)

3. RESOLUTION (On-Chain Data)
   └─► Block 12345678 arrives
   └─► Hook checks: block.basefee, block.difficulty, or oracle price
   └─► Resolution: YES wins (ETH was > $5000)
   └─► YES token holders can redeem for USDC

4. PAYOUT
   └─► YES tokens → 1 USDC each
   └─► NO tokens → 0 USDC (burned)
```

---

# 4. Where Each Sponsor Fits

| Sponsor | Role in Prediction Markets |
|---------|---------------------------|
| **Uniswap V4** | Host prediction market pools (YES/NO AMM) + Agent Gate hook |
| **ENS** | Agent identity (`.agent.eth` subnames) for market participation |
| **Yellow Network** | HFT within markets via state channels |
| **Li.Fi** | Bridge USDC to market chain |
| **Circle Arc** | Settlement layer (USDC native gas, privacy for positions) |
| **UMA** | Dispute resolution for ambiguous outcomes |

---

# 5. Smart Contract Components

## [NEW] `PredictionMarketHook.sol` (V4 Hook)

```solidity
contract PredictionMarketHook is BaseHook {
    struct Market {
        bytes32 questionId;
        uint256 resolutionBlock;
        bool resolved;
        bool outcome; // true = YES wins
    }
    
    mapping(PoolId => Market) public markets;
    IAgentRegistry public registry;
    
    // AGENT GATE: Only registered agents can trade
    function beforeSwap(...) external override returns (bytes4) {
        if (!registry.isAgent(msg.sender)) {
            revert NotRegisteredAgent();
        }
        return this.beforeSwap.selector;
    }
    
    // AUTO-RESOLVE: Check resolution conditions
    function afterSwap(...) external override returns (bytes4) {
        Market storage m = markets[poolId];
        if (block.number >= m.resolutionBlock && !m.resolved) {
            m.outcome = _checkOutcome(m.questionId);
            m.resolved = true;
            emit MarketResolved(poolId, m.outcome);
        }
        return this.afterSwap.selector;
    }
    
    // REDEMPTION: Winners claim USDC
    function redeemWinningTokens(PoolId poolId) external {
        Market storage m = markets[poolId];
        require(m.resolved, "Not resolved");
        // Burn YES or NO tokens, transfer USDC to winner
    }
}
```

## [NEW] `AgentRegistry.sol` (ENS Integration)

```solidity
contract AgentRegistry {
    IENSResolver public ens;
    
    mapping(address => bytes32) public agentToSubname;
    mapping(address => bytes) public teeAttestations;
    
    function registerAgent(bytes32 subname, bytes calldata attestation) external {
        // Verify caller owns the ENS subname
        // Store TEE attestation for future verification
    }
    
    function isAgent(address addr) external view returns (bool) {
        return agentToSubname[addr] != bytes32(0);
    }
}
```

---

# 6. The "Silicon Gate" (Revised)

**Original Concept:** LLM puzzle to filter humans
**Problem:** LLMs can solve puzzles; doesn't prove agent-ness

**Revised Concept:** The gate has TWO layers:

1. **Identity Layer (On-Chain)**
   - Must hold `.agent.eth` ENS subname
   - Must have valid TEE attestation

2. **Velocity Layer (Off-Chain, via Yellow)**
   - Markets broadcast "opportunities" (new questions)
   - Agents have <100ms to submit position intents to sequencer
   - Humans physically cannot react fast enough

---

# 7. MVP Scope (Hackathon)

## Phase 1: Core Demo (48-72 hours)

| Component | Deliverable |
|-----------|-------------|
| V4 Hook | `PredictionMarketHook` with agent gate + binary resolution |
| Registry | `AgentRegistry` with ENS integration |
| Agent | OpenClaw agent that creates markets and trades |

## Phase 2: If Time Permits

| Component | Deliverable |
|-----------|-------------|
| Yellow | State channel HFT within markets |
| UI | "Spectator Terminal" showing agent activity |

## Phase 3: Post-Hackathon

| Component | Deliverable |
|-----------|-------------|
| Arc Integration | Deploy on Arc for USDC gas |
| UMA Disputes | Handle ambiguous outcomes |
| Real TEE | Phala attestations |

---

# 8. Verification Plan

## Automated Tests
- `PredictionMarketHook.t.sol`:
  - `test_AgentCanTrade()` - registered agent swaps YES/NO
  - `test_HumanRejected()` - unregistered address reverts
  - `test_MarketResolves()` - resolution at target block
  - `test_WinnerRedeems()` - payout to winning side

## Demo Flow
1. **Deploy** markets: "Will next block gas > 50 gwei?"
2. **Agent A** buys YES (predicts high gas)
3. **Agent B** buys NO (predicts low gas)
4. **Block arrives** → Market auto-resolves
5. **Winner claims** USDC payout
6. **Human tries** to trade → Transaction reverts

---

# 9. Key Insight

> **V4 hooks ARE the prediction market infrastructure.**
> 
> We don't need CTF separately—V4 pools can directly represent binary outcomes.
> The YES/NO tokens are just the two sides of a V4 pool.
> The hook enforces agent-only access AND auto-resolution.
