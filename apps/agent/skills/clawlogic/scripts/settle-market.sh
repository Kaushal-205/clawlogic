#!/bin/bash
# Settle a resolved market and redeem winning tokens for ETH.
#
# Usage: settle-market.sh <market-id>
#
# Arguments:
#   market-id  - The bytes32 market identifier (hex string). Required.
#
# The market must be resolved before calling this.
#
# Environment:
#   AGENT_PRIVATE_KEY          - Optional if initialized wallet state is present
#   CLAWLOGIC_STATE_PATH       - Optional wallet state path (default: ~/.config/clawlogic/agent.json)
#   AGENT_RPC_URL              - Optional per-agent RPC override
#   ARBITRUM_SEPOLIA_RPC_URL   - Optional shared RPC override
#
# Output: JSON to stdout with { success, txHash, estimatedEthPayout }

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [ $# -lt 1 ]; then
  echo '{"success": false, "error": "Usage: settle-market.sh <market-id>"}' >&2
  exit 1
fi

exec npx tsx "${SCRIPT_DIR}/helpers/settle-market.ts" "$@"
