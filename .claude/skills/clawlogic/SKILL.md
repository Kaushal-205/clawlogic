---
name: clawlogic
description: Expert architectural and performance guidelines for building the $CLAWLOGIC Agent-Only Prediction Market.
---

# $CLAWLOGIC Developer Expert Skill

This skill provides **deep technical guidelines** for building $CLAWLOGIC, derived from analysis of Uniswap V4, Yellow Network, and High-Frequency Agent/EVM interaction.

---

## 1. Architectural Invariants

> **CRITICAL:** Do not violate these invariants.

1.  **Latency is Off-Chain:** The EVM has 12s block times (ETH). You CANNOT build a "50ms reaction gate" on-chain.
    *   **Correct Pattern:** Agents submit signed intents to a **Yellow Network State Channel** or centralized sequencer. The sequencer enforces the <50ms window and batches valid trades for on-chain settlement.
2.  **V4 Pools = Prediction Markets:** Do not build a separate CTF contract if you can avoid it.
    *   **Pattern:** A V4 Pool with `YES` and `NO` tokens (as the two assets) *is* the prediction market.
    *   **Hook:** Controls minting/burning and resolution.
3.  **Identity is Mandatory:** `beforeSwap` MUST revert if `!AgentRegistry.isAgent(msg.sender)`.

---

## 2. Uniswap V4 Gas Optimization (EIP-1153)

Uniswap V4 uses **Flash Accounting** and **Transient Storage**. Your hook must align with this to be commercially viable.

### 🔴 Bad Pattern (Expensive)
```solidity
// Writes to storage (20k gas)
function beforeSwap(...) {
    userSwaps[sender]++; 
}
```

### 🟢 Good Pattern (Transient)
```solidity
// EIP-1153 TSTORE (100 gas)
// Only valid for this transaction (cheap checks)
function beforeSwap(...) {
    assembly {
        tstore(SLOT, add(tload(SLOT), 1))
    }
}
```

### Checklist for Hooks:
- [ ] **Use `exttload`**: For reading PoolManager state cheaply.
- [ ] **Avoid Loops**: Resolution logic in `afterSwap` must be O(1) or O(small N). Do not loop through 1000 users.
- [ ] **Delta Accounting**: Use `CurrencyDelta` logic if implementing custom curves.

---

## 3. Agent Performance (Latency)

For $CLAWLOGIC agents to compete:

1.  **Communication**: Use **gRPC** or **WebSockets** for sequencer connection (Yellow Network), NOT HTTP polling.
2.  **Runtime**: Run agent logic in a persistent process (Node.js/Rust/Python), not serverless functions (cold starts kill HFT).
3.  **Topology**: Co-locate agent servers in the same region as the Sequencer/RPC node.

---

## 4. Security Audit Checklist

### Prediction Market Specifics
- [ ] **Oracle Front-running**: If using a public pool update to trigger resolution, ensure the block author cannot manipulate the outcome. (Use TWAP or Chainlink VRF).
- [ ] **Staleness**: Check `priceFeed.updatedAt` timestamp. Revert if data is > X minutes old.
- [ ] **Redemption Lock**: Ensure losing tokens are strictly burned or rendered valueless.

### Identity Specifics
- [ ] **ENS Ownership**: Verify `ens.owner(node) == sender`. Don't just trust a registry mapping.
- [ ] **TEE Sig Replay**: Include `nonce` and `chainId` in TEE attestations to prevent replay on other chains.

---

## 5. Development Workflow

### Compile & Test
```bash
# Optimized build
forge build --via-ir

# Run tests with gas report
forge test --gas-report
```

### Deployment (Base Sepolia)
```bash
# Verify strictly
forge script script/Deploy.s.sol --rpc-url $BASE_RPC --verify
```

---

## 6. Resources

- **Uniswap V4:** [v4-core repo](https://github.com/Uniswap/v4-core)
- **Yellow Network:** [ClearSync docs](https://docs.yellow.org)
- **OpenClaw (Agent):** Internal repo
- **Circle Arc:** [Developers](https://developers.circle.com)
