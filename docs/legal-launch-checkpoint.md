# CLAWLOGIC Legal Launch Checkpoint

Last updated: 2026-02-11 (UTC)

## Purpose

Operational checkpoint for commercial launch readiness focused on license compliance and third-party dependency risk.

## Source Of Truth

- `docs/licensing-policy.md`
- `THIRD_PARTY_LICENSES.md`

If this document conflicts with either file above, those files control.

## Pre-Launch Checklist

Mark each item complete before a commercial launch decision.

- [ ] MIT boundaries confirmed:
  - `packages/contracts/src/**` remains MIT-compatible per file headers.
  - `packages/sdk/**` remains MIT-compatible per file headers.
- [ ] Vendored SPDX headers preserved (no removed or modified upstream SPDX identifiers).
- [ ] Third-party inventory complete in `THIRD_PARTY_LICENSES.md` for all vendored/imported code paths.
- [ ] BUSL review complete for Uniswap v4 components (scope, restrictions, and planned usage documented).
- [ ] AGPL review complete for UMA interface files under `packages/contracts/src/interfaces/uma` (distribution and operational impact documented).
- [ ] Attribution completeness verified (path, upstream source, and license notes present for each third-party component).
- [ ] Any new dependency added since last review has explicit license classification and risk status.
- [ ] Final legal/compliance sign-off recorded.

## Go / No-Go Gates

GO only if all gates pass.

1. Policy Conformance Gate
- GO: MIT boundary checks and SPDX preservation pass.
- NO-GO: Any boundary drift, missing MIT markers in open paths, or altered upstream SPDX.

2. High-Risk License Gate
- GO: BUSL and AGPL implications reviewed and accepted by accountable owners.
- NO-GO: Any unresolved BUSL/AGPL usage question.

3. Attribution Gate
- GO: `THIRD_PARTY_LICENSES.md` is complete and current for release contents.
- NO-GO: Missing dependency entries, missing upstream source, or unclear license notes.

4. Unknown Terms Gate
- GO: No dependency with unknown/unclear terms remains open.
- NO-GO: Any unresolved unknown/unclear license term blocks launch.

## Required Artifacts And Owners

1. License Boundary Verification Note
- Owner: Engineering Lead (Agent/Protocol)
- Content: MIT boundary validation for `packages/contracts/src/**` and `packages/sdk/**`, plus header spot-check results.

2. Third-Party Dependency License Inventory Diff
- Owner: Release Manager
- Content: Release delta for `THIRD_PARTY_LICENSES.md`, including newly added dependencies.

3. SPDX And Header Integrity Report
- Owner: Security/Compliance Engineer
- Content: Evidence that vendored SPDX headers were not changed.

4. BUSL And AGPL Risk Memo
- Owner: External Counsel or Founder delegate
- Content: Accept/reject decision and usage constraints for BUSL/AGPL components.

5. Final Launch Legal Sign-Off Record
- Owner: Founder/CEO
- Content: Explicit GO/NO-GO decision with timestamp.

## Escalation Path For Unknown Or Unclear License Terms

1. Immediately mark release status as BLOCKED.
2. Open a `legal-license-blocker` issue with:
- dependency/path
- detected license text or ambiguity
- where it is used in product flow
- proposed mitigation options
3. Assign within 24 hours to Engineering Lead and Founder/CEO.
4. Request clarification from upstream maintainer and/or external counsel.
5. Decide one path before unblock:
- replace dependency
- isolate/remove affected feature
- obtain explicit legal approval with documented constraints
6. Update artifacts and re-run gates; only then return to GO consideration.

## Minimal Weekly Review Cadence

Run a 20-minute weekly legal/compliance check (minimum).

- Participants: Engineering Lead, Release Manager, Founder/CEO (counsel optional unless blocker exists).
- Agenda:
  - new or changed third-party dependencies
  - BUSL/AGPL exposure changes
  - unresolved license blockers
  - launch date impact
- Outputs:
  - gate status (GO-ready or BLOCKED)
  - owner and due date for each open blocker
  - artifact updates if dependency/license state changed
