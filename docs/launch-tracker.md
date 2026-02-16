# CLAWLOGIC Launch Tracker

Last updated: 2026-02-16 (UTC)
Owner: Founder (solo) + AI contributors
Canonical status file for launch execution, risk, and correction history.

## Mission Snapshot

Ship a production-focused CLAWLOGIC launch with:

- reliable agent onboarding
- CPMM-based market operation for v1
- clear resolution flow
- sane security controls
- optional (not required) ENS identity
- branch strategy that keeps confidential chain rollout isolated

## Locked Decisions (Do Not Drift)

- Product direction is production-focused, not hackathon-focused.
- `dev` is the Arbitrum contract/config track.
- `main` will receive `dev` code after merge.
- Confidential alternate-chain launch work stays on a temporary branch.
- Do not include confidential chain names in branch names.
- Keep code and configuration portable for seamless chain switching in production.
- Launch direction is CPMM-first for v1.
- No protocol treasury seeding for launch liquidity.
- No hard TVL caps by policy.
- ENS is optional for onboarding and trading.
- ENS is a monetizable premium identity add-on:
  - one-time purchase
  - payment asset: USDC
  - pricing model: length tiers
- Licensing model is hybrid:
  - open-source contracts and SDK under MIT
  - keep selected off-chain operational strategy components private

## Branch Strategy

| Branch | Purpose | Notes |
| --- | --- | --- |
| `main` | stable baseline | receives merged `dev` |
| `dev` | primary Arbitrum development | contracts/config source of truth |
| `temp/*` | confidential launch variant | no target-chain naming leakage |

## Current Status Dashboard

| Workstream | Status | Notes |
| --- | --- | --- |
| Canonical launch tracking doc | done | this file |
| README/AGENTS tracker wiring | done | linked + policy added |
| Licensing policy and attribution docs | done | root license + policy + third-party inventory |
| CPMM v1 alignment on `dev` | done | creator/protocol fee accrual + claims implemented and tested |
| Agent onboarding simplification | done | CLI and docs now default to non-ENS registration with explicit `--ens-name` opt-in |
| ENS monetization implementation | done | registrar + treasury/event controls + deploy wiring + CLI add-on commands + web onboarding guidance are implemented |
| Security hardening for launch | partial | `tx.origin` removed, pause controls added, and assertionId handoff/persistence added for settlement reliability; strict/live full-run smoke still pending |

## Priority Task Backlog

### P0 (Blockers before launch)

- [x] Replace `tx.origin` auth pattern in hook callbacks with production-safe sender verification flow.
- [x] Ensure active launch branch includes emergency pause controls.
- [x] Enforce consistent onboarding path where ENS is optional and non-ENS registration always succeeds.
- [x] Expand CLI readiness checks beyond `funded && registered` to include practical trading readiness.
- [x] Add e2e coverage for onboarding and first trade path.
- [x] Reconcile docs and implementation so launch claims match actual behavior.

### P1 (High-value next)

- [x] Implement ENS premium name purchase flow (USDC payment, one-time purchase, length-tier pricing). (implemented in registrar + deploy wiring + SDK/CLI flow; web path currently CLI-driven)
- [x] Add treasury/recipient controls and event logging for ENS revenue.
- [x] Add CLI commands for ENS add-on flow (`buy-name`, `link-name`).
- [x] Add web onboarding split: required base registration vs optional paid ENS identity.
- [x] Add operational runbook for incident response and rollback.
- [x] Add legal review checkpoint before commercial mainnet launch for third-party license mix (BUSL/AGPL dependencies).
- [x] Implement market trading fee split tracking and claims (creator share + protocol share).

### P2 (Post-launch hardening)

- [x] Add richer onboarding analytics funnel (`init -> funded -> registered -> first trade -> first settle`).
- [x] Add progressive rollout gates and canary market checklist.
- [x] Add formalized cross-chain configuration switch runbook.

## Security Findings And Fix Queue

### SEC-001 (Critical)

- Finding (historical): `tx.origin` was used for auth in hook callbacks on `dev`.
- Impact: phishing/proxy auth risk; production blocker.
- Action: remove and replace with explicit trusted forwarding/signer model.
- Status: closed on `dev` (hook now validates forwarded callback `sender` against AgentRegistry).

### SEC-002 (High)

- Finding (historical): launch safety controls differed by branch and were not consistently present on `dev`.
- Impact: reduced emergency response capability.
- Action: standardize pause controls on active launch branch.
- Status: closed on `dev` (pause/unpause controls added to mutable market actions).

### SEC-003 (High)

- Finding: onboarding and operational flows have only partial end-to-end test coverage.
- Impact: integration regressions can reach launch.
- Action: add onboarding + trade + resolution path tests and harden settlement operability.
- Status: partial (contract lifecycle coverage exists; deterministic assertionId handoff/persistence added to reduce resolution stalls; strict/live orchestrator smoke still open).

## Agent Onboarding Gaps

- ENS registration should not be treated as the default required path.
- Onboarding status should expose staged readiness:
  - wallet funded
  - registry registered
  - market tradable
  - resolution path available
- Web onboarding should communicate optional premium ENS clearly.
- CLI and docs should guide plain-name registration first, ENS second.

## Revenue And ENS Premium Identity

Locked v1 commercial model:

- ENS premium identity is optional.
- Agents can buy `*.clawlogic.eth` add-on identity.
- USDC payment.
- Length-tier pricing.
- One-time purchase model.

Implementation notes to complete:

- Name availability checks.
- Front-run resistance around claims.
- Clear treasury accounting and withdrawal controls.
- Purchase and link event indexing for analytics.

## Cross-Chain Readiness Matrix

| Capability | `dev` (Arbitrum) | confidential temp branch | Notes |
| --- | --- | --- | --- |
| Core contracts | active | isolated variant | keep interfaces portable |
| Launch docs | active | shared | do not reveal confidential target chain |
| Branch naming policy | enforced | enforced | no chain leakage in names |
| Production migration path | required | required | config-first switching |

## Licensing And OSS Boundary

- Open components:
  - `packages/contracts/src/**` (MIT for CLAWLOGIC-authored files)
  - `packages/sdk/**` (MIT)
- Private-eligible components:
  - off-chain strategy and sensitive operational playbooks
- Canonical docs:
  - `LICENSE`
  - `docs/licensing-policy.md`
  - `THIRD_PARTY_LICENSES.md`
- CI guard:
  - `pnpm license:check` verifies root license presence/link and license headers in newly added contract/SDK source files

## Correction Log Policy (Mandatory, Append-Only)

Every founder correction must be logged immediately with:

- UTC timestamp
- previous assumption
- founder correction
- updated invariant/rule
- affected files/modules
- follow-up tasks

Do not delete old entries. If direction changes again, append a new entry.

## Correction Log

| ID | Timestamp (UTC) | Previous assumption | Founder correction | Updated rule |
| --- | --- | --- | --- | --- |
| COR-001 | 2026-02-11 | Continue hackathon-style positioning | Move to product-focused execution | Prioritize production reliability and launch viability over demo-only scope |
| COR-002 | 2026-02-11 | Single-track branch assumptions | Use `dev` for Arbitrum and separate temp branch for confidential launch variant | Maintain branch separation for rapid chain switching |
| COR-003 | 2026-02-11 | Branch naming may include chain | Do not include confidential chain name in branch name | Enforce chain-secret naming discipline |
| COR-004 | 2026-02-11 | Hard caps expected as default risk control | Remove hard caps | Use other controls (pause and operational discipline) |
| COR-005 | 2026-02-11 | ENS can remain strict in onboarding | ENS must be optional | Base registration/trading cannot depend on ENS ownership |
| COR-006 | 2026-02-11 | ENS is only identity metadata | ENS should become revenue feature | Implement paid premium ENS flow |
| COR-007 | 2026-02-11 | ENS monetization unspecified | One-time purchase model | No renewal complexity in v1 |
| COR-008 | 2026-02-11 | Payment token unspecified | Use USDC for ENS purchases | Implement ERC20 payment path |
| COR-009 | 2026-02-11 | Flat pricing assumed | Use length-tier pricing | Premium short names priced higher |
| COR-010 | 2026-02-11 | Full repo open-source assumed by default | Open-source contracts + SDK; keep selected off-chain operational strategy private | Adopt hybrid licensing boundary |
| COR-011 | 2026-02-11 | Open license type not locked | Standardize open components on MIT | Keep low-friction adoption while documenting third-party exceptions |
| COR-013 | 2026-02-11 | Sequential single-thread implementation flow is acceptable by default | Use autonomous skill installation and parallel multi-workstream execution with task-specific skill ownership | Execute launch backlog in parallel tracks wherever safely possible |
| COR-014 | 2026-02-11T18:35:01Z | Skill installation remained part of active launch backlog | Remove skill installation tasks from current launch execution | Focus parallel execution only on product-critical launch tasks |
| COR-015 | 2026-02-12T20:30:36Z | RPC override path can remain global-only | Keep public RPC as default and allow agent-level custom RPC overrides | Runtime must default to public RPC while honoring `AGENT_RPC_URL` per agent before shared RPC envs |
| COR-016 | 2026-02-15T20:43:32Z | Terminal-style, protocol-heavy frontend can remain the default UX | Reposition web app to spectator-first prediction-market UX with agent-native style and advanced details hidden by default | Default UI must emphasize markets, odds, and agent interactions; protocol internals are advanced-only disclosures |
| COR-017 | 2026-02-16T09:58:52Z | Spectator-first UI can keep a familiar dark cyber-terminal visual language | Push a materially different, unmistakable visual identity for product differentiation | Frontend theme changes must be high-contrast from prior versions and establish a unique product signature while preserving market readability |
| COR-018 | 2026-02-16T10:29:04Z | Theme refresh alone is sufficient for product-b frontend differentiation | Add multi-theme support (including light mode) and visual market identities tied to each market | Product UI must support user-controlled theme toggle and each market must display an image identity generated/backfilled into shared web assets |

### Correction Log Addendum (Detailed Fields)

| ID | Timestamp (UTC) | Previous assumption | Founder correction | Updated invariant/rule | Affected files/modules | Follow-up tasks |
| --- | --- | --- | --- | --- | --- | --- |
| COR-012 | 2026-02-11T12:25:27Z | Fee sharing could remain implicit in docs without on-chain accounting visibility | Track creator-agent fee sharing explicitly and ensure protocol can query/claim it | CPMM trades must accrue creator + protocol fees on-chain with claim and read surfaces | `packages/contracts/src/PredictionMarketHook.sol`, `packages/contracts/src/interfaces/IPredictionMarketHook.sol`, `packages/contracts/test/PredictionMarketHook.t.sol`, `packages/sdk/src/client.ts`, `packages/sdk/src/types.ts`, `packages/sdk/src/abis/predictionMarketHookAbi.ts` | Add UI and CLI claim surfaces; add analytics indexing for fee events |
| COR-013A | 2026-02-11T12:25:27Z | Skill installation could be manual or deferred | Install requested external skills autonomously when instructed | Attempt automated skill install first; if blocked, log blocker and proceed with implementation tracks | `runtime environment`, `/home/kaushal/.codex/skills`, `packages/sdk/src/cli/index.ts`, `apps/web/src/app/page.tsx`, `packages/contracts/src/ENSPremiumRegistrar.sol` | Retry `find-skills` install once DNS/network is available; restart Codex after install |
| COR-014A | 2026-02-11T18:35:01Z | Skill installation remained in active tracker backlog and implementation sequencing | Remove skill installation tasks from active launch plan now | Launch execution excludes skill-install workstream unless reintroduced explicitly by founder | `docs/launch-tracker.md`, `.agents/skills/*` | Keep existing installed skills inert; do not schedule further skill-install tasks in launch backlog |
| COR-015A | 2026-02-12T20:30:36Z | Skill/runtime docs could treat private key and RPC behavior as implicitly understood | Explicitly document wallet key resolution + external broadcast target + per-agent RPC override precedence | Public RPC default is mandatory baseline; wallet signing can resolve from env or initialized state; broadcast egress must be disclosed in skill docs | `packages/sdk/src/cli/runtime.ts`, `apps/agent/skills/clawlogic/scripts/helpers/setup.ts`, `apps/agent/skills/clawlogic/scripts/helpers/analyze-market.ts`, `apps/agent/skills/clawlogic/scripts/helpers/post-broadcast.ts`, `apps/agent/skills/clawlogic/SKILL.md`, `README.md`, `packages/sdk/README.md` | Sync published skill mirror and re-run checker commands for docs/skill consistency |
| COR-016A | 2026-02-15T20:43:32Z | Frontend could remain terminal/infra-first for launch visibility | Shift to spectator-first market product experience; keep technical proof paths but not in default flow | Home and market surfaces must read like a prediction market product: clean copy, no raw addresses/jargon by default, advanced toggles for protocol detail | `apps/web/src/app/page.tsx`, `apps/web/src/components/MarketList.tsx`, `apps/web/src/components/MarketCard.tsx`, `apps/web/src/components/AgentFeed.tsx`, `apps/web/src/components/Navigation.tsx`, `apps/web/src/components/Footer.tsx`, `apps/web/src/app/market/[id]/page.tsx`, `apps/web/src/app/layout.tsx` | Validate responsive UX and advanced toggle behavior; run web build checks after dependency install |
| COR-017A | 2026-02-16T09:58:52Z | Repositioning to spectator-first was sufficient without a major visual departure | Introduce a totally distinct theme for `product-b` to feel new and brand-defining | `product-b` frontend should use a unique palette/background/surface language that is visibly distinct from `product-a` while retaining usability | `apps/web/src/app/globals.css`, `apps/web/src/app/page.tsx`, `apps/web/src/app/market/[id]/page.tsx`, `apps/web/src/components/*`, `apps/web/src/app/layout.tsx` | Verify build stability and cross-page readability after global palette refactor |
| COR-018A | 2026-02-16T10:29:04Z | Distinct visual style could stay single-theme and market cards could remain text-only | Add a light-theme toggle and persistent per-market profile media generated at create-time + backfilled for existing markets | Frontend must ship with user-selectable light/dark mode and market visuals loaded from shared manifest-backed assets, not ad-hoc inline text labels | `apps/web/src/app/globals.css`, `apps/web/src/components/Navigation.tsx`, `apps/web/src/components/MarketList.tsx`, `apps/web/src/components/MarketCard.tsx`, `apps/web/src/app/market/[id]/page.tsx`, `apps/web/src/lib/market-images.ts`, `apps/web/public/market-profiles.json`, `packages/sdk/src/cli/index.ts`, `packages/sdk/src/cli/market-images.ts`, `apps/agent/src/agent-alpha.ts`, `apps/agent/src/market-image-store.ts` | Run market-image backfill command on target env, verify image rendering across existing markets, and confirm theme preference persistence on mobile/desktop |

## Change History

- 2026-02-11: Created canonical launch tracker and seeded backlog, security queue, and correction log.
- 2026-02-11: Added licensing boundary decisions, compliance tasks, and correction entries (COR-010, COR-011).
- 2026-02-11: Completed P0 security + onboarding updates on `dev` (removed `tx.origin`, added pause controls, made ENS opt-in in CLI/docs, expanded `doctor` readiness checks).
- 2026-02-11: Added contract regression tests for pause controls (owner-only, pause block, unpause recovery).
- 2026-02-11: Added contract e2e test for onboarding (non-ENS) and first directional trade; tracked creator fee-share implementation as pending.
- 2026-02-11: Implemented creator/protocol fee split accounting and claim flows in CPMM trade path; added contract tests and SDK read/write methods (`getMarketFeeInfo`, `getClaimableFees`, `claimCreatorFees`, `claimProtocolFees`).
- 2026-02-11: Added CLI fee commands (`fees`, `claim-creator-fees`, `claim-protocol-fees`) and web fee panel showing creator/protocol accrual.
- 2026-02-11: Started ENS premium monetization flow with `ENSPremiumRegistrar` (USDC tiers + commit/reveal + one-time ownership), SDK methods, CLI commands (`name-quote`, `name-commit`, `name-buy`), and contract tests.
- 2026-02-11: Attempted autonomous install of `find-skills` from skills.sh; blocked by DNS/network resolution failure in this environment.
- 2026-02-11T17:08:07Z: Installed and enabled role skills for software/product/security/AI/blockchain/smart-contract/cryptography/devops/CEO tracks; repeated DNS failures (`EAI_AGAIN` + github host resolution) blocked additional installs for explicit `tech-lead`, `project-manager`, `tokenomics`, and `qa tester` role labels.
- 2026-02-11T17:09:30Z: Added local role-alias skills under `.agents/skills` for missing labels (`security-researcher`, `blockchain-engineer`, `cryptography-expert`, `tech-lead`, `ceo`, `project-manager`, `smart-contract-developer`, `tokenomics-expert`, `qa-tester`) so multi-agent assignment can proceed without waiting on external DNS recovery.
- 2026-02-11T18:35:01Z: Removed skill-installation items from active launch backlog per founder correction and completed parallel workstreams for onboarding split UI, incident response runbook, and legal launch checkpoint.
- 2026-02-11T18:53:59Z: Added `docs/rollout-canary-checklist.md` and `docs/cross-chain-switch-runbook.md`; marked related P2 rollout/switch documentation tasks complete.
- 2026-02-11T19:05:17Z: Reconciled tracker with implemented code evidence (`ENSPremiumRegistrar`, deploy script wiring, CLI `name-buy`/`buy-name` + `link-name`, and web onboarding funnel); updated dashboard and P1/P2 task statuses accordingly.
- 2026-02-11T19:17:41Z: Hardened operational settlement path by persisting UMA assertion metadata to `.clawlogic/assertions.json`, using deterministic assertionId handoff from `runAssertDemo` to `runSettleDemo` in orchestrator, and adding local-record fallback in settlement flow when RPC log scanning is constrained.
- 2026-02-12T19:33:42Z: Aligned `clawlogic` skill for ClawHub/OpenClaw publication by converting frontmatter metadata to single-line JSON, removing stale dispute-command guidance, making ENS optional by default in examples, emphasizing creator-seeded CPMM create flow, adding fee + ENS add-on command coverage, and syncing published mirror (`apps/agent/skills/clawlogic` -> `skills/clawlogic`).
- 2026-02-12T20:07:01Z: Completed ClawHub publish flow: authenticated CLI as `@Kaushal-205`, published `clawlogic@0.1.0` (`k97eax7c154thtr80td1ttq0sd810k2c`), and confirmed registry visibility via `clawhub explore`.
- 2026-02-12T20:30:36Z: Enforced public-RPC default with agent-level override precedence (`AGENT_RPC_URL` -> shared RPC vars -> default), switched market analysis helper to true read-only client path, added wallet-state fallback for signing helpers, and documented broadcast egress + credential expectations in skill docs/README.
- 2026-02-15T20:43:32Z: Implemented spectator-first UI repositioning on web market surfaces by removing terminal-first home emphasis, simplifying market/feed language, hiding protocol internals behind advanced toggles, moving Silicon Gate simulation to advanced-only display, and reducing default footer/nav technical clutter.
- 2026-02-16T09:58:52Z: Created `product-b` and implemented a fully distinct frontend theme pass (new cyan-gold-coral palette, aurora background system, updated card/surface styling, and global color refactor across app/components) while preserving existing market/agent functionality and passing web build verification.
- 2026-02-16T10:29:04Z: Added user theme toggle (light/dark, persisted), wired market profile-image rendering in list/detail surfaces, introduced CLI/agent market-image persistence hooks, and added manifest-backed image generation/backfill support for existing markets with successful SDK/agent/web build checks.
