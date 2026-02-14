# CLAWLOGIC Licensing Policy

Last updated: 2026-02-11 (UTC)

## Policy Summary

CLAWLOGIC uses a hybrid licensing model:

- Open-source core protocol components under MIT
- Keep selected off-chain operational strategy components private

This policy is designed to balance trust/composability with sustainable solo-founder operations.

## Open Components (MIT)

These paths are intended to remain open-source under MIT unless explicitly superseded:

- `packages/contracts/src/**`
- `packages/sdk/**`

Notes:

- File-level SPDX identifiers apply first.
- Third-party subtrees retain upstream licenses.

## Private / Restricted Operational Components

The following classes of assets may be kept private or moved to private repos:

- proprietary agent strategy logic
- infra automation containing sensitive operational details
- deployment and incident-response runbooks with sensitive internals
- confidential launch configuration not intended for public disclosure

## Third-Party License Compliance

See `THIRD_PARTY_LICENSES.md` for vendored dependency licensing and attribution.

Contributor requirements:

- preserve SPDX headers
- do not relicense vendored code
- keep third-party imports attributable and isolated

## Contribution Rules

- Contributions to open paths are accepted under MIT terms.
- New Solidity files in `packages/contracts/src/` must include SPDX headers.
- New source files in `packages/sdk/src/` must include a clear MIT license header comment.

Accepted SDK header formats (first 5 lines):

- `// License: MIT`
- `/* License: MIT */`
- `// SPDX-License-Identifier: MIT`

## Commercial Use Notes

- MIT-licensed CLAWLOGIC components permit commercial use.
- Third-party dependency terms still apply where relevant (for example BUSL/AGPL-labeled upstream files).
- Review licensing implications before commercial mainnet deployment.
