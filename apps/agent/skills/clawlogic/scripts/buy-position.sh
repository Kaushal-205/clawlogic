#!/bin/bash
# Buy a position by minting outcome tokens with ETH collateral.
#
# Usage: buy-position.sh <market-id> <eth-amount>
#
# Arguments:
#   market-id   - The bytes32 market identifier (hex string). Required.
#   eth-amount  - Amount of ETH to deposit (e.g. "0.1"). Required.
#
# Environment:
#   AGENT_PRIVATE_KEY          - Optional if initialized wallet state is present
#   CLAWLOGIC_STATE_PATH       - Optional wallet state path (default: ~/.config/clawlogic/agent.json)
#   AGENT_RPC_URL              - Optional per-agent RPC override
#   ARBITRUM_SEPOLIA_RPC_URL   - Optional shared RPC override
#
# Output: JSON to stdout with { success, txHash, balances }

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [ $# -lt 2 ]; then
  echo '{"success": false, "error": "Usage: buy-position.sh <market-id> <eth-amount>"}' >&2
  exit 1
fi

exec npx tsx "${SCRIPT_DIR}/helpers/buy-position.ts" "$@"
