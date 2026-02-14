# Third-Party Licenses

This repository includes third-party components that are licensed under their own terms.
File-level SPDX identifiers and upstream license files take precedence for those components.

## Uniswap v4 Components

- Path: `packages/contracts/lib/v4-core`
- Upstream: https://github.com/Uniswap/v4-core
- License notes:
  - Mixed licensing in upstream (includes BUSL-1.1 and MIT by file)
  - See `packages/contracts/lib/v4-core/licenses/BUSL_LICENSE`
  - See `packages/contracts/lib/v4-core/licenses/MIT_LICENSE`

- Path: `packages/contracts/lib/v4-periphery`
- Upstream: https://github.com/Uniswap/v4-periphery
- License notes:
  - Upstream includes MIT-licensed components
  - Individual files may specify exact SPDX identifiers

## UMA Interface Definitions

- Path: `packages/contracts/src/interfaces/uma`
- Source origin: UMA protocol interface definitions
- License notes:
  - Files are marked with `SPDX-License-Identifier: AGPL-3.0-only`
  - Treat these files under AGPL-3.0-only terms unless replaced with equivalents under different licensing

## OpenZeppelin Dependencies (vendored via submodules/libraries)

- Path: `packages/contracts/lib/openzeppelin-contracts`
- Upstream: https://github.com/OpenZeppelin/openzeppelin-contracts
- License notes:
  - See upstream `README` and license metadata in that subtree

## Rule For Contributors

- Do not change or remove upstream SPDX headers in vendored code.
- Keep third-party code in dedicated vendor paths.
- When adding a new dependency, update this file with path, upstream source, and license summary.
