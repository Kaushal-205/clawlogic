#!/bin/bash
# =============================================================================
# CLAWLOGIC Foundry Project Setup Script
# =============================================================================
# Run this script from packages/contracts/ to complete the Foundry setup.
# Prerequisites: forge must be installed (foundryup)
#
# Usage:
#   cd /home/kaushal/lampros/clawlogic/packages/contracts
#   chmod +x setup.sh
#   ./setup.sh
# =============================================================================

set -euo pipefail

CONTRACTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$CONTRACTS_DIR"

echo "============================================="
echo "  CLAWLOGIC Foundry Setup"
echo "  Target: Arbitrum Sepolia (chain ID 421614)"
echo "============================================="
echo ""
echo "Working directory: $CONTRACTS_DIR"
echo ""

# Step 1: Verify forge is available
echo "[1/7] Verifying forge installation..."
if ! command -v forge &> /dev/null; then
    echo "ERROR: forge not found in PATH."
    echo "Install Foundry: curl -L https://foundry.paradigm.xyz | bash && foundryup"
    exit 1
fi
forge --version
echo ""

# Step 2: Install forge-std (test framework)
echo "[2/7] Installing forge-std..."
if [ ! -d "lib/forge-std" ]; then
    forge install foundry-rs/forge-std --no-git --no-commit
    echo "  -> forge-std installed."
else
    echo "  -> forge-std already installed, skipping."
fi
echo ""

# Step 3: Install Uniswap V4 core
echo "[3/7] Installing Uniswap V4 core..."
if [ ! -d "lib/v4-core" ]; then
    forge install Uniswap/v4-core --no-git --no-commit
    echo "  -> v4-core installed."
else
    echo "  -> v4-core already installed, skipping."
fi
echo ""

# Step 4: Install Uniswap V4 periphery
echo "[4/7] Installing Uniswap V4 periphery..."
if [ ! -d "lib/v4-periphery" ]; then
    forge install Uniswap/v4-periphery --no-git --no-commit
    echo "  -> v4-periphery installed."
else
    echo "  -> v4-periphery already installed, skipping."
fi
echo ""

# Step 5: Install OpenZeppelin
echo "[5/7] Installing OpenZeppelin contracts..."
if [ ! -d "lib/openzeppelin-contracts" ]; then
    forge install OpenZeppelin/openzeppelin-contracts --no-git --no-commit
    echo "  -> openzeppelin-contracts installed."
else
    echo "  -> openzeppelin-contracts already installed, skipping."
fi
echo ""

# Step 6: Install UMA protocol (optional; we have manual interfaces as fallback)
echo "[6/7] Installing UMA protocol (optional)..."
if [ ! -d "lib/protocol" ]; then
    if forge install UMAprotocol/protocol --no-git --no-commit 2>/dev/null; then
        echo "  -> UMA protocol installed."
    else
        echo "  -> UMA protocol install failed (repo may be too large)."
        echo "  -> This is expected. Manual interface files in src/interfaces/uma/ are used instead."
        echo "  -> These interfaces are sourced from https://github.com/UMAprotocol/dev-quickstart-oov3"
    fi
else
    echo "  -> UMA protocol already installed, skipping."
fi
echo ""

# Step 7: Build to verify everything compiles
echo "[7/7] Running forge build..."
if forge build; then
    echo ""
    echo "============================================="
    echo "  Setup Complete - Build Successful"
    echo "============================================="
    echo ""
    echo "Next steps:"
    echo "  forge test              # Run tests"
    echo "  forge build             # Compile contracts"
    echo "  forge test -vvv         # Run tests with verbose output"
    echo ""
    echo "Project structure:"
    echo "  src/                    # Contract source files"
    echo "  src/interfaces/         # Interface definitions"
    echo "  src/interfaces/uma/     # UMA OOV3 interface files"
    echo "  test/                   # Foundry test files"
    echo "  test/helpers/           # Shared test fixtures"
    echo "  script/                 # Deployment scripts"
    echo "  deployments/            # Deployed address records"
    echo "  lib/                    # Installed dependencies"
else
    echo ""
    echo "ERROR: Build failed. Check compiler errors above."
    exit 1
fi
