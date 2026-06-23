# Phase 09 - Skills Doctor and Package Boundary v1

## Objective

Add skills supply-chain audit and doctor diagnostics while preserving package/runtime public surface boundaries.

## Dependencies

- Phase 02.
- Phase 07.

## Owned Paths

- `schemas/skills-lock.schema.json`
- `scripts/skills-audit.mjs`
- `scripts/doctor.mjs`
- `scripts/lib/skills-lock.mjs`
- `tests/skills-doctor-contract.test.mjs`
- `tests/package-materialization.test.mjs`
- `package/package-contract.yaml`

## Read-only Paths

- `package/runtime-surface.json` unless a separate public-surface decision is approved.
- Live `.claude`, `.codex`, and `${MOONSHOT_RELAY_HOME}` account-root state.

## Work Items

| ID | Work Item | Output |
|---|---|---|
| P09-1 | Define `skills.lock` schema with source, commit, content hash, license, stages, and permissions. | Skills lock schema |
| P09-2 | Add audit command for missing lock, hash drift, license gaps, and permission review. | Skills audit |
| P09-3 | Add doctor diagnostics for runtime settings, Git state, schema versions, and package drift. | Doctor command |
| P09-4 | Update package contract without expanding public runtime skill discovery accidentally. | Package guard |

## Acceptance Criteria

- Doctor detects missing, hash drift, license, and permission review gaps.
- Package materialization tests prove common payload additions do not expand profile-local public skill discovery.
- Runtime surface non-expansion is asserted unless explicitly approved.

## Verification Signals

- `node --test tests/skills-doctor-contract.test.mjs`
- `node --test tests/package-materialization.test.mjs`
- `npm test`

## Review-Improvement Loop

- Review focus: public skill surface drift, package payload drift, account-root mutation.
- Re-review trigger: package contract or runtime surface behavior changes.

## Phase 09 Closeout

Status: complete

Implemented:
- Added skills lock schema with source path, content hash, license, stage, permissions, and permission review fields.
- Added skills lock discovery, generation, audit, and runtime surface non-expansion guard.
- Added `skills-audit` and `doctor` CLI diagnostics.
- Updated package materialization allowlist and package contract for common payload doctor/audit support scripts without expanding profile-local public skill discovery.
- Added contract tests for missing lock, hash drift, license gaps, permission review gaps, runtime surface expansion, CLI behavior, and package materialization.
- Updated phase runner projection so optional backlog phases are not promoted to active work unless explicitly pulled into scope.

Verification:
- `node --test tests\skills-doctor-contract.test.mjs tests\package-materialization.test.mjs tests\syntax-schema-contract.test.mjs`
- `node --test tests\workflow-e2e-contract.test.mjs tests\skills-doctor-contract.test.mjs tests\package-materialization.test.mjs tests\syntax-schema-contract.test.mjs`
- `node --check package\build-package.mjs; node --check scripts\skills-audit.mjs; node --check scripts\doctor.mjs; node --check scripts\lib\skills-lock.mjs`
