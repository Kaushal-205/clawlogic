#!/bin/bash
# Analyze a prediction market -- returns full details for agent reasoning.
#
# Usage: analyze-market.sh <market-id>
#
# Arguments:
#   market-id  - The bytes32 market identifier (hex string). Required.
#
# Environment:
#   AGENT_PRIVATE_KEY          - Optional for read-only analysis
#   CLAWLOGIC_STATE_PATH       - Optional wallet file path (defaults to ~/.config/clawlogic/agent.json)
#   AGENT_RPC_URL              - Optional per-agent RPC override
#   ARBITRUM_SEPOLIA_RPC_URL   - Optional shared RPC override
#
# Output: JSON to stdout with market details, positions, token metrics, and analysis hints.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [ $# -lt 1 ]; then
  echo '{"success": false, "error": "Usage: analyze-market.sh <market-id>"}' >&2
  exit 1
fi

exec npx tsx "${SCRIPT_DIR}/helpers/analyze-market.ts" "$@"
