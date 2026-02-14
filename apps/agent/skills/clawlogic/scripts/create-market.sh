#!/bin/bash
# Create a new prediction market.
#
# Usage: create-market.sh <outcome1> <outcome2> <description> [reward] [bond] [initial_liquidity_wei]
#
# Arguments:
#   outcome1     - Label for outcome 1 (e.g. "yes"). Required.
#   outcome2     - Label for outcome 2 (e.g. "no"). Required.
#   description  - Human-readable market question. Required.
#   reward       - Bond currency reward for asserter, in wei. Optional, defaults to "0".
#   bond         - Minimum bond for assertion, in wei. Optional, defaults to "0".
#   initial_liquidity_wei - ETH value (wei) to seed CPMM at market creation. Optional, defaults to "0".
#
# Environment:
#   AGENT_PRIVATE_KEY          - Optional if initialized wallet state is present
#   CLAWLOGIC_STATE_PATH       - Optional wallet state path (default: ~/.config/clawlogic/agent.json)
#   AGENT_RPC_URL              - Optional per-agent RPC override
#   ARBITRUM_SEPOLIA_RPC_URL   - Optional shared RPC override
#
# Output: JSON to stdout with { success, txHash, marketId }

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [ $# -lt 3 ]; then
  echo '{"success": false, "error": "Usage: create-market.sh <outcome1> <outcome2> <description> [reward] [bond] [initial_liquidity_wei]"}' >&2
  exit 1
fi

exec npx tsx "${SCRIPT_DIR}/helpers/create-market.ts" "$@"
