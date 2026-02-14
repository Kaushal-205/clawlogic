#!/bin/bash
# Check the agent's token positions across one or all markets.
#
# Usage: check-positions.sh [market-id]
#
# Arguments:
#   market-id  - Optional. Show positions for this market only.
#                If omitted, shows positions across ALL markets.
#
# Environment:
#   AGENT_PRIVATE_KEY          - Optional if initialized wallet state is present
#   CLAWLOGIC_STATE_PATH       - Optional wallet state path (default: ~/.config/clawlogic/agent.json)
#   AGENT_RPC_URL              - Optional per-agent RPC override
#   ARBITRUM_SEPOLIA_RPC_URL   - Optional shared RPC override
#
# Output: JSON to stdout with { success, positions, ethBalance }

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

exec npx tsx "${SCRIPT_DIR}/helpers/check-positions.ts" "$@"
