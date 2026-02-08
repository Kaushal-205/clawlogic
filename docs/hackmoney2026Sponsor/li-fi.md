# LI.FI (HackMoney 2026)

## Integration (Code Links)

- LI.FI quote wrapper:
  - https://github.com/Kaushal-205/clawlogic/blob/main/packages/sdk/src/bridge.ts#L127
- LI.FI status wrapper:
  - https://github.com/Kaushal-205/clawlogic/blob/main/packages/sdk/src/bridge.ts#L133
- LI.FI execute wrapper (signed tx + receipt wait):
  - https://github.com/Kaushal-205/clawlogic/blob/main/packages/sdk/src/bridge.ts#L147
- Agent preflight + route suggestion + execution gate:
  - https://github.com/Kaushal-205/clawlogic/blob/main/apps/agent/src/index.ts#L148
  - https://github.com/Kaushal-205/clawlogic/blob/main/apps/agent/src/index.ts#L209

## On-Chain Context (Target Chain)

- Arbitrum Sepolia deployment:
  - Hook: https://sepolia.arbiscan.io/address/0xB3C4a85906493f3Cf0d59e891770Bb2e77FA8880
  - Registry: https://sepolia.arbiscan.io/address/0xd0B1864A1da6407A7DE5a08e5f82352b5e230cd3

- Post-onboarding trade txs (after funding gate path):
  - https://sepolia.arbiscan.io/tx/0x15804807d25e09218c1f997f72f819f7b407a0a1d09031acf104cb145408891c
  - https://sepolia.arbiscan.io/tx/0x669a1e01e1baa12092600f06e825e3875ba429b0a04c7fb8d2601e8b6c5077f9
