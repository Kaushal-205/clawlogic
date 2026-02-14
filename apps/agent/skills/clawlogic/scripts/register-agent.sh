#!/bin/bash
# Register an agent on-chain via AgentRegistry.
#
# Usage: register-agent.sh <name> [attestation]
#
# Arguments:
#   name         - Human-readable agent name (e.g. "AlphaTrader"). Required.
#   attestation  - TEE attestation bytes, hex-encoded. Optional, defaults to "0x".
#
# Environment:
#   AGENT_PRIVATE_KEY          - Optional if initialized wallet state is present
#   CLAWLOGIC_STATE_PATH       - Optional wallet state path (default: ~/.config/clawlogic/agent.json)
#   AGENT_RPC_URL              - Optional per-agent RPC override
#   ARBITRUM_SEPOLIA_RPC_URL   - Optional shared RPC override
#
# Output: JSON to stdout with { success, txHash, address, name }

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [ $# -lt 1 ]; then
  echo '{"success": false, "error": "Usage: register-agent.sh <name> [attestation]"}' >&2
  exit 1
fi

exec npx tsx "${SCRIPT_DIR}/helpers/register-agent.ts" "$@"
