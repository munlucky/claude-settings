# Moonshot Relay Workflow E2E Hardening Master Plan v1

## Objective

Verify and harden the whole Moonshot Relay working process, not only harness path drift. The target workflow is:

`snapshot -> issue discovery -> workflow/process audit -> plan package -> independent review loop -> phase execution -> verification -> repository closeout -> optional commit-moonshot -> account-root install sync`.

This package records the full current issue inventory found by local inspection plus four independent read-only agents on 2026-06-06. It is not limited to priority fixes.

## Baseline

- Repo: `C:\dev\moonshot-relay`
- Branch state during audit: `main...origin/main`
- Worktree: clean
- `npm test`: pass, 58 pass / 1 skip
- `npm run test:package`: pass
- `npm run test:legacy-archive`: pass
- `node package/build-package.mjs --runtime all --dry-run --json`: pass, Claude 422 planned, Codex 330 planned
- `node bin/moonshot-relay.mjs install --runtime all --dry-run --moonshot-home C:\Users\moon\.moonshot-relay --claude-home C:\Users\moon\.claude --codex-home C:\Users\moon\.codex`: pass, moonshot 127, Claude 237, Codex 218 planned

Passing tests do not prove the end-to-end workflow is healthy. Most current checks guard path/materialization contracts. The missing layer is an executable workflow bridge from plan package readiness to phase execution and closeout.

## Issue Register

The complete register is in `ISSUE_REGISTER.md`. Summary by class:

| Class | Count | Main Risk |
| --- | ---: | --- |
| Source/profile bootstrap and document paths | 8 | Work starts from missing or conflicting profile contracts |
| Plan package and phase-runner bridge | 10 | Plans can be marked ready while phase execution cannot start deterministically |
| Closeout artifact and completion evidence | 7 | Markdown-only or ignored evidence can false-pass or become unreproducible |
| Verification and platform gates | 9 | Active gates miss syntax, schema, workflow-warning, or browser-flow regressions |
| Install/runtime/browser materialization | 8 | Account-root sync can break browser runtime or leave config drift hidden |
| Packaging/materialization precision | 4 | Broad denylist and weak dry-run checks can hide payload loss |
| Workflow process friction | 6 | Manual filtering, duplicated commands, and oversized templates waste turns |

## Phases

| Phase | File | Goal | Depends On |
| --- | --- | --- | --- |
| 01 | `01-source-profile-bootstrap-contract-v1.md` | Fix source checkout bootstrap, document path authority, and stale `.claude` assumptions. | none |
| 02 | `02-plan-runner-readiness-bridge-v1.md` | Add or define the active machine-readable bridge from plan package to phase-runner readiness. | 01 |
| 03 | `03-closeout-artifact-contract-v1.md` | Define plan-level closeout manifest/schema and reduce Markdown-only completion authority. | 02 |
| 04 | `04-verification-gate-expansion-v1.md` | Add active schema/syntax/workflow-warning gates and README test-command alignment. | 01 |
| 05 | `05-install-runtime-browser-contract-v1.md` | Protect browser runtime dependencies, browser-flow runner behavior, Codex config drift, and installer symlink fallback. | 01 |
| 06 | `06-packaging-materialization-precision-v1.md` | Make denylist path-aware and strengthen dry-run payload checks. | 04,05 |
| 07 | `07-workflow-simplification-and-e2e-regression-v1.md` | Add synthetic E2E workflow regression and simplify small/docs-only workflow ceremony. | 02,03,04 |

## Acceptance Matrix

- Default active gate passes: `npm test`.
- Package gate passes: `npm run test:package`.
- Legacy archive compatibility gate remains separate: `npm run test:legacy-archive`.
- A new workflow E2E smoke proves plan package readiness, phase runner preparation, attempt/closeout artifact contract, and repository closeout without requiring a real product implementation.
- Active syntax gate covers maintained `.mjs`, active shell scripts, and `.ps1` parser checks.
- Schema gate parses and validates YAML/JSON contracts beyond regex presence checks.
- Profile `documentPaths` are either consistent or have explicit typed override semantics.
- Account-root install dry-run warns on protected config drift and does not erase browser runtime dependencies without rebootstrap or protected runtime storage.
- `browser-flow=smoke` either has a packaged default runner or is explicitly setup-gap unless a runner exists.
- Plan-level closeout is represented by a machine-readable artifact; Markdown QA/HANDOFF can render it but is not the only authority.

## Review Evidence

Independent audit outputs were summarized in `planning-loop/independent-audit-summary.md`.

## Execution Boundary

Do not apply all phases as one broad cleanup. Each phase should add characterization tests before behavior changes where possible.

Account-root actual install sync is a final adoption action only after source tests and dry-run checks pass.
