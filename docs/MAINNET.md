# Mainnet Runbook (Arbitrum One)

## 1. Deploy contracts

`packages/contracts/.env` (never commit it):

| Variable | Value |
|---|---|
| `PRIVATE_KEY` / `DEPLOYER_PRIVATE_KEY` | fresh deployer wallet, funded with a little ETH |
| `ARBITRUM_ONE_RPC_URL` | dedicated provider URL |
| `ETHERSCAN_API_KEY` | Etherscan API v2 key (verifies on every Etherscan chain) |
| `V4_POOL_MANAGER` | `0x360E68faCcca8cA495c1B759Fd9EEe466db9FB32` |
| `UMA_OOV3` | `0xa6147867264374F324524E30C02C331cF28aa879` |
| `UMA_BOND_CURRENCY` | UMA-whitelisted token (WETH `0x82aF…Bab1` or USDC `0xaf88…5831`) |
| `DEFAULT_LIVENESS` | `7200` (minimum on mainnet) |
| `PROTOCOL_OWNER` | your Safe — **required** on mainnet (must call `acceptOwnership()` on the hook afterwards) |
| `TREASURY` | receives protocol fees (defaults to `PROTOCOL_OWNER`, never to the deployer) |
| `PROTOCOL_FEE_BPS` / `LP_FEE_BPS` | default `100` / `100` (1% + 1%), cap 10% total |
| `MARKET_CREATION_FEE_WEI` | default `0`, cap 0.1 ETH |
| `MAX_REQUIRED_BOND` | largest per-market asserter bond in bond-currency units (default `0` = UMA minimum only; e.g. `1000000000` for 1,000 USDC) |
| `ERC8004_IDENTITY_REGISTRY` | `0x8004A169FB4a3325136EB29fA0ceB6D2e539a432` (ERC-8004 agents trade without registering) |

```bash
cd packages/contracts
source .env
forge test
forge script script/Deploy.s.sol --rpc-url arbitrum_one --broadcast --verify -vvvv
```

Output: `deployments/arbitrum-one.json`. Then from the Safe: `acceptOwnership()` on the
PredictionMarketHook.

Before broadcasting, check the `Final owner` and `Treasury` lines the script prints.
Every chain that is not a known testnet is treated as production (no mocks, owner
required).

To redeploy only the hook with the same configuration, use `script/DeployHookOnly.s.sol`
(same env). If the Safe already owns the AgentReputationRegistry, call
`setRecorder(<new hook>)` on it from the Safe.

## 2. Redeploy testnet

The new SDK calls functions that only exist in the new contracts. Redeploy Arbitrum
Sepolia with the same script (`--rpc-url arbitrum_sepolia`) and update
`DEFAULT_CONTRACTS` in `packages/sdk/src/cli/constants.ts`.

## 3. Release the SDK (agents always run `npx @clawlogic/sdk@latest`)

1. Put the mainnet `AgentRegistry` / `PredictionMarketHook` addresses in
   `ARBITRUM_ONE_CONFIG` (`packages/sdk/src/config.ts`).
2. Optionally make mainnet the CLI default: `DEFAULT_NETWORK` in
   `packages/sdk/src/cli/constants.ts`.
3. Bump `packages/sdk/package.json` to `0.2.0`, run `pnpm sdk:sync-web-dep`, commit, tag
   `sdk-v0.2.0`.

Do not publish before steps 1–2: `@latest` would point agents at contracts that do not
have the new functions.

## 4. Web (Vercel env)

See `apps/web/.env.example`: `NEXT_PUBLIC_CHAIN_ID=42161`, `NEXT_PUBLIC_RPC_URL`,
`NEXT_PUBLIC_AGENT_REGISTRY`, `NEXT_PUBLIC_PREDICTION_MARKET_HOOK`,
`NEXT_PUBLIC_V4_POOL_MANAGER`, `NEXT_PUBLIC_UMA_OOV3`, plus the server-only KV and
`AGENT_BROADCAST_API_KEY`.

## 5. Operate

- `withdrawProtocolFees()` (anyone can call) sends accrued fees to the treasury.
- Every market has a resolution time (within 365 days). Assertions revert before it, and
  trading closes at it (or at an earlier close time).
- The market reward is paid to the asserter of the accepted outcome via
  `claimAssertionReward(marketId)` (anyone can call; the CLI's `settle` does it).
- A squatted or abandoned question can be freed for re-creation with
  `releaseMarketKey(marketId)`: the owner at any time, anyone 30 days after the
  market's resolution time. The market itself keeps working.
- `setMaxRequiredBond(amount)` caps the bond new markets may demand.
- `setPaused(true)` halts creation and trading; merge, LP withdrawal, assertion and
  settlement keep working.
- Seed liquidity in the first markets yourself: an empty market cannot be traded.
