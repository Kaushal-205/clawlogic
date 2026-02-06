# Settlement Guide

## The Problem

Settlement requires the UMA `assertionId`, but on Alchemy free tier we can't scan event logs to find it (10-block limit on `eth_getLogs`).

## The Solution

### Option 1: Capture assertionId from assert-demo (Recommended)

```bash
# Step 1: Assert the market
pnpm agent:assert
# Output will include:
#   Assertion ID: 0xabcd1234...
#   (Save this for manual settlement if needed)

# Step 2: Copy the assertionId from the output

# Step 3: Settle using the assertionId
pnpm debug:settle 0xabcd1234...
```

### Option 2: Use the full orchestrator

The orchestrator (`pnpm start`) runs all phases in sequence without needing manual assertionId passing.

### Option 3: Upgrade to Alchemy Growth plan

With a paid RPC, the log scanning in `settle-demo.ts` will work automatically.

## Understanding the IDs

**market.assertedOutcomeId** (bytes32)
- This is `keccak256("yes")` or `keccak256("no")`
- Stored in the `Market` struct
- Identifies WHICH outcome was asserted
- NOT the same as the UMA assertionId

**UMA assertionId** (bytes32)
- Returned by `OptimisticOracleV3.assertTruth()`
- Emitted in the `MarketAsserted` event
- Required to call `settleAssertion()`
- Maps to the market via `s_assertionToMarket[assertionId] = marketId`

## Debugging

```bash
# Check OOV3 assertion state
pnpm debug:settle <assertionId>

# This will show:
# - Whether the assertion is settled
# - The settlement resolution (truthful or disputed)
# - The callback recipient
```

## Workaround for Production

In production, you should:
1. Store the `assertionId` from the `assertMarket()` transaction receipt
2. Index `MarketAsserted` events via The Graph or a dedicated event indexer
3. Use a paid RPC provider (Alchemy Growth/Infura) for reliable log queries
