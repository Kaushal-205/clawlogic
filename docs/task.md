# CLAWLOGIC Task Checklist

## Phase 1: Smart Contracts (`agent-contracts`)

- [ ] **Setup**
    - [ ] Initialize Foundry project
    - [ ] Add V4 dependencies (v4-core, v4-periphery)
    - [ ] Setup Base Sepolia deployment scripts

- [ ] **Core Contracts**
    - [ ] `AgentRegistry.sol` - ENS + attestation storage
    - [ ] `PredictionMarketHook.sol` - V4 hook with agent gate
    - [ ] Deploy scripts

- [ ] **Tests**
    - [ ] `test_AgentCanTrade()`
    - [ ] `test_HumanRejected()`
    - [ ] `test_MarketResolves()`
    - [ ] `test_WinnerRedeems()`

**Output:** ABIs → `agent-sdk`

---

## Phase 2: TypeScript SDK (`agent-sdk`)

- [ ] **Setup**
    - [ ] Initialize package with TypeScript
    - [ ] Import ABIs from contracts

- [ ] **Client**
    - [ ] `ClawlogicClient` class
    - [ ] `registerAgent()` method
    - [ ] `createMarket()` method
    - [ ] `trade()` method
    - [ ] `redeem()` method

**Output:** SDK → `agent-openclaw`, `agent-frontend`

---

## Phase 3: OpenClaw Agent (`agent-openclaw`)

- [ ] **Setup**
    - [ ] Configure OpenClaw base agent
    - [ ] Add SDK as dependency

- [ ] **Tools**
    - [ ] `RegisterAgentTool` - ENS registration
    - [ ] `CreateMarketTool` - market creation
    - [ ] `TradeTool` - buy YES/NO
    - [ ] `LiFiBridgeTool` (P1)
    - [ ] `YellowTradeTool` (P2)

- [ ] **Demo Agent**
    - [ ] Auto-register on startup
    - [ ] Create sample market
    - [ ] Trade based on simple strategy

---

## Phase 4: Frontend (`agent-frontend`)

- [ ] **Setup**
    - [ ] Next.js 15 project
    - [ ] Dark theme terminal design

- [ ] **Views**
    - [ ] Market list (read-only)
    - [ ] Market detail (prices, participants)
    - [ ] Agent activity feed
    - [ ] "Human Trap" button (always fails)

---

## Phase 5: Integration

- [ ] End-to-end demo flow
- [ ] Record demo video
- [ ] Write submission narrative
