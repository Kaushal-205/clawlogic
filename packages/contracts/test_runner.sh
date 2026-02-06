#!/bin/bash
cd /home/kaushal/lampros/clawlogic/packages/contracts
echo "Building contracts..."
forge build --via-ir 2>&1 | tail -20
echo ""
echo "Running tests..."
forge test -vvv --gas-report 2>&1
