# Phase 01: Legacy Archive Contract Split (v1)

## Source Mapping

| Req ID | Source Section | Requirement Summary | This Phase Handling |
|--------|----------------|---------------------|---------------------|
| SRC-1 | Harness surface plan | Move legacy command catalog out of active contract | Removes top-level `legacyCommands` and creates a legacy reference owner |

## Goal

Separate active verification contract semantics from legacy delegated-terminal command catalog without deleting archive files or weakening legacy investigation evidence policy.

## Expected Outcome

`schemas/verification.contract.yaml` no longer exposes archive command catalog as active contract surface, while `legacyValidationProfiles.legacy_phase_adapter` remains available as the evidence policy for explicit compatibility investigations.

## Phase Execution Metadata

```yaml
phaseExecution:
  schemaVersion: 1
  parallelEligible: true
  parallelGroup: wave-1
  dependsOn: []
  conflictsWith:
    - 02-phase-projection-terminology-v1
  ownedPaths:
    - schemas/verification.contract.yaml
    - docs/public/reference/legacy-phase-adapters.md
    - docs/public/repository-layout.md
    - tests/active-contracts.test.mjs
    - tests/package-layout.test.mjs
  readOnlyPaths:
    - archive/scripts/legacy-phase-adapters/**
    - package/build-package.mjs
    - package/package-contract.yaml
    - package/profile-templates/**
  sharedMutablePaths:
    - tests/active-contracts.test.mjs
    - docs/public/repository-layout.md
  requiresManualEvidence: false
  mergePolicy: coordinated_shared_tests
```

## Scope

- In scope:
  - Remove only top-level `legacyCommands` from `schemas/verification.contract.yaml`.
  - Add `docs/public/reference/legacy-phase-adapters.md` as the command catalog and compatibility reference.
  - Add tests proving active contracts do not carry archive command strings.
- Out of scope:
  - Moving or deleting `archive/scripts/legacy-phase-adapters/**`.
  - Removing `legacyValidationProfiles.legacy_phase_adapter`.
  - Running legacy archive commands as active gates.

## Preconditions and Inputs

- Required docs:
  - `00-master-plan-v1.md`
- Required code/data:
  - Baseline `rg -n "legacyCommands|archive/scripts/legacy-phase-adapters" schemas tests docs package`.

## Detailed Tasks

| ID | Task | Steps | Done Criteria |
|----|------|-------|---------------|
| P01-1 | Add RED contract coverage | Add active contract test that fails while `legacyCommands` exists in `schemas/verification.contract.yaml`; include archive command string rejection outside allowed legacy reference paths | Test fails on current baseline and names `legacyCommands` |
| P01-2 | Move catalog | Delete top-level `legacyCommands` from schema; create `docs/public/reference/legacy-phase-adapters.md` with command names, purpose, archive path, replacement active path, allowed use, and `legacyAdapterReason` requirement | Schema has no top-level `legacyCommands`; reference exists |
| P01-3 | Preserve legacy policy | Keep `checkPolicies.legacyValidationProfiles.legacy_phase_adapter` unchanged except wording that points to the new reference | Legacy policy remains discoverable |
| P01-4 | Register docs boundary | Update repository layout/reference classification or package docs so the new reference is source-owned docs, not active runtime command contract | Public docs classify the reference correctly |

## Critical Product Scenarios

| ID | User-Visible Expectation | Verification Command | Expected Signal | Evidence Path |
|----|--------------------------|----------------------|-----------------|---------------|
| SCN-01-1 | Active verification contract does not advertise archive commands | `node --test tests/active-contracts.test.mjs` | Pass after RED/GREEN | test output |
| SCN-01-2 | Legacy archive remains preserved but non-default | `npm run test:legacy-archive` | Pass | test output |

## Exact Execution Targets

| ID | Files To Create | Files To Modify | Files To Test | Commands | Expected Fail/Pass Signals |
|----|-----------------|-----------------|---------------|----------|----------------------------|
| P01-1 | none | `tests/active-contracts.test.mjs` | `tests/active-contracts.test.mjs` | `node --test tests/active-contracts.test.mjs` | RED fails on current `legacyCommands`; GREEN passes |
| P01-2 | `docs/public/reference/legacy-phase-adapters.md` | `schemas/verification.contract.yaml`, `docs/public/repository-layout.md` | package/layout tests | `npm run test:package` | archive excluded, reference included |

## Blockers And Review

- Blocker condition: Any implementation removes `legacyValidationProfiles.legacy_phase_adapter` or moves archive files.
- First review checkpoint: After RED test and before schema edit.
- Re-review trigger: Any direct `archive/scripts/legacy-phase-adapters` command appears in active docs outside the new reference.
- Verification evidence path: test output plus `rg` results.

## Validation Plan

- [ ] Regression checks: `node --test tests/active-contracts.test.mjs`
- [ ] Archive compatibility check: `npm run test:legacy-archive`
- [ ] Package checks: `npm run test:package`
- [ ] Full active gate: `npm test`
- [ ] Hygiene: `git diff --check`

## Evidence to Mark Done

- `rg -n "^legacyCommands:" schemas/verification.contract.yaml` returns no matches.
- `rg -n "legacyValidationProfiles|legacy_phase_adapter" schemas/verification.contract.yaml` confirms policy remains.
- `docs/public/reference/legacy-phase-adapters.md` exists and names `legacyAdapterReason`.
- Focused and full tests pass.

## Deliverables

- Active contract without legacy command catalog.
- Legacy archive reference document.
- Regression tests for archive command catalog separation.

## Phase Completion Checklist

- [ ] RED test captured current contract leak
- [ ] `legacyCommands` moved out of active schema
- [ ] Legacy reference registered
- [ ] Legacy policy preserved
- [ ] Validation checks pass

## Handoff Notes

Phase 02 may share `tests/active-contracts.test.mjs` and `docs/public/repository-layout.md`; coordinate merge order if both run in parallel.
