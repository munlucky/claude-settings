# Moonshot Relay Contract Hardening Master Plan v2

Status: authoritative executable plan for `docs/implementation/moonshot-relay-bottleneck-hardening-2026-06-06/`.

Supersedes: `00-master-plan-v1.md`, `01-test-and-package-contract-v1.md`, `02-runtime-path-and-reference-contract-v1.md`, and `03-verifier-shell-review-loop-v1.md`.

## Objective

Close the currently discovered Moonshot Relay contract drift by turning each failure class into an executable guard, then fixing the active docs, skills, installers, package materialization, and runtime paths until the guards pass.

This plan does not treat documentation edits as completion evidence. Completion requires source scans, package/materialization checks, installer/runtime smoke checks, and the default active test gate to pass.

## Problem Classes Covered

1. Canonical source, installed profile, generated state, and archive specimen boundary drift.
2. Active test/docs dependency on archived legacy internals.
3. Missing runtime assets and stale runtime references.
4. Missing `.claude/docs/guidelines/*` references.
5. Incorrect setup/install/manual staging instructions.
6. Browser runtime path and executable newline portability failures.
7. MemoryGraph state-root migration drift.
8. Package materialization dry-run signal mismatch.
9. Platform and shell portability gaps outside `npm test`.

## Phase Inventory

| Phase | File | Depends On | Primary Evidence |
| --- | --- | --- | --- |
| 1 | `01-boundary-contract-guards-v2.md` | none | guard tests fail on forbidden active references |
| 2 | `02-archive-boundary-removal-v2.md` | 1 | active tests no longer import/exec archive internals |
| 3 | `03-runtime-asset-contract-v2.md` | 1 | browser-flow runner contract is restored or optional-only |
| 4 | `04-guideline-reference-contract-v2.md` | 1 | referenced guideline files exist in source/materialized payload |
| 5 | `05-install-command-contract-v2.md` | 1,4 | setup skill and README install commands smoke correctly |
| 6 | `06-browser-runtime-path-contract-v2.md` | 1,3 | browserctl LF and browser runtime resolver tests pass |
| 7 | `07-memorygraph-state-root-contract-v2.md` | 1 | skills/docs do not present `.claude/cache` as the default state root |
| 8 | `08-materialization-dry-run-contract-v2.md` | 1,4 | dry-run planned paths match clean materialization planned paths |
| 9 | `09-platform-shell-gate-v2.md` | 2,5,6,8 | expanded install/runtime/package/shell gate is green |

## Shared Boundaries

### Canonical Source

Tracked repository source under `scripts/`, `agents/`, `skills/`, `rules/`, `docs/public/`, `package/`, `templates/`, `tools/`, and tests.

### Installed Profile

Files materialized into account or project profiles, including `.claude/**` and `.codex/**`. Active docs may mention these as installed/local entrypoints, not as canonical source locations.

### Generated State

Runtime verdicts, logs, caches, MemoryGraph output, sqlite state, browser artifacts, and `.moonshot-relay/state/**`. These are not package payload source.

### Archive Specimen

`archive/**` is preserved evidence and compatibility specimen material. Active gates, public docs, and maintainer default flows must not require executing archive internals.

## Candidate Source Surfaces

Phase files define authoritative owned paths. The full investigation surface is:

- `README.md`
- `package.json`
- `package/build-package.mjs`
- `package/package-contract.yaml`
- `package/profile-templates/**`
- `scripts/lib/**`, installer scripts, and runtime helper entrypoints named by phase docs
- `agents/verification/**` and active agent docs named by phase docs
- `skills/**` files named by phase docs
- `rules/**`, `docs/public/**`, and `tests/**` files named by phase docs
- `.gitattributes`

## Staged Paths

- `docs/implementation/moonshot-relay-bottleneck-hardening-2026-06-06/**`
- Temporary materialization output under `package/*/profile/**`
- Generated runtime verdict/log artifacts only as verification evidence, not source edits.

## Read-Only Paths

- `archive/**`, except when a phase explicitly states a compatibility-only fixture read.
- Existing unrelated plan packages under `docs/implementation/**`.
- User/runtime profile state under root `.claude/**`, root `.codex/**`, and `%USERPROFILE%/.moonshot-relay/state/**`.

## Live Mutation Policy

Do not edit installed account-root profiles directly in phases 1-8. Source, package template, and installer changes must be verified through materialization/install dry-run. Direct installed-profile sync is a separate adoption action after this plan is green.

This plan is source/package-only. Account-root sync and downstream installed-profile adoption are explicitly excluded from the acceptance claim unless a later adoption task is opened.

## Acceptance Matrix

- `npm test` exits 0.
- Active docs/skills reference existence scan reports 0 unresolved source/materialized references, excluding documented historical evidence snapshots.
- Active docs/skills have 0 recommended/default archive execution commands.
- Active tests have 0 direct archive runtime imports/exec dependencies.
- Executable CRLF scan reports 0 actionable failures for `bin/*`, `*.sh`, and shebang-bearing `*.py`, `*.mjs`, `*.js`.
- Browser-flow missing-runner behavior is explicitly tested as restored or optional-only structured verdict.
- Browser-flow contract decision: optional-only. Missing runner must produce a structured `setup_gap` verdict and must not masquerade as successful browser verification.
- Guideline canonical target decision: active human-facing guideline docs live under `docs/public/guidelines/**` and may be materialized into installed docs from there.
- `package/build-package.mjs --dry-run --json` returns the real planned copy set.
- Dry-run planned path set matches clean materialization planned path set for comparable inputs.
- Installer/runtime smoke commands pass or return documented structured unsupported-platform output.

## Independent Review Loop

Review artifacts live under `planning-loop/`. The parent session owns all edits to this plan package. Accepted findings are applied to phase docs; rejected findings are recorded with reasons.
