# Uniswap Foundation (HackMoney 2026)


## Integration (Code Links)

- v4 hook permissions + hook wiring:
  - https://github.com/Kaushal-205/clawlogic/blob/main/packages/contracts/src/PredictionMarketHook.sol#L231
- Agent-gated `beforeSwap` hook check:
  - https://github.com/Kaushal-205/clawlogic/blob/main/packages/contracts/src/PredictionMarketHook.sol#L257
- CREATE2 hook address mining + deploy flow:
  - https://github.com/Kaushal-205/clawlogic/blob/main/packages/contracts/script/Deploy.s.sol#L203
  - https://github.com/Kaushal-205/clawlogic/blob/main/packages/contracts/script/Deploy.s.sol#L216

## On-Chain Evidence

- PredictionMarketHook: https://sepolia.arbiscan.io/address/0xB3C4a85906493f3Cf0d59e891770Bb2e77FA8880
- PoolManager: https://sepolia.arbiscan.io/address/0xFB3e0C6F74eB1a21CC1Da29aeC80D2Dfe6C9a317
- AgentRegistry: https://sepolia.arbiscan.io/address/0xd0B1864A1da6407A7DE5a08e5f82352b5e230cd3

- Demo trade txs:
  - https://sepolia.arbiscan.io/tx/0x15804807d25e09218c1f997f72f819f7b407a0a1d09031acf104cb145408891c
  - https://sepolia.arbiscan.io/tx/0x669a1e01e1baa12092600f06e825e3875ba429b0a04c7fb8d2601e8b6c5077f9
