# Phase 03: Task-Local Completion Read Model (v1)

## Source Mapping

| Req ID | Source Section | Requirement Summary | This Phase Handling |
|--------|----------------|---------------------|---------------------|
| SRC-3 | Harness surface plan | Separate task-local evidence from whole-plan authority | Adds projection fields without changing accepted completion gates |

## Goal

Expose task-local evidence completion and whole-plan authority as separate read-model signals, while keeping accepted completion logic unchanged.

## Expected Outcome

Operators can see that docs-only or prompt-only work has task-local complete evidence without mistaking it for whole-plan accepted authority.

## Phase Execution Metadata

```yaml
phaseExecution:
  schemaVersion: 1
  parallelEligible: false
  parallelGroup: wave-2
  dependsOn:
    - 01-legacy-archive-contract-split-v1
    - 02-phase-projection-terminology-v1
  conflictsWith: []
  ownedPaths:
    - scripts/lib/verification-plane.mjs
    - scripts/lib/runtime-state-store.mjs
    - schemas/verification.contract.yaml
    - schemas/verification-plane.schema.json
    - tests/verification-plane-contract.test.mjs
    - tests/runtime-read-model-contract.test.mjs
    - tests/completion-authority-contract.test.mjs
    - docs/public/runtime-control-plane.md
    - docs/public/guidelines/verification-contract.md
  readOnlyPaths:
    - scripts/phase-final-guard.mjs
    - package/build-package.mjs
    - scripts/install-account-root-harness.mjs
    - package/package-contract.yaml
    - .claude/**
    - .codex/**
    - .moonshot-relay/**
  sharedMutablePaths: []
  requiresManualEvidence: false
  mergePolicy: disjoint_patch
```

## Scope

- In scope:
  - Add additive `taskLocalCompletion` and `wholePlanAuthority` projection fields.
  - Add `compactStatus.latestVerificationEvidence` as a normalized projection.
  - Update schemas/docs/tests.
- Out of scope:
  - Changing `completion_decisions` schema or enum.
  - Relaxing `COMPLETION_AUTHORITY_REQUIRED_PLANES`.
  - Using task-local fields as `assess-completion` acceptance input.

## Preconditions and Inputs

- Required docs:
  - `00-master-plan-v1.md`
  - `02-phase-projection-terminology-v1.md`
- Required code/data:
  - Current `buildVerificationSummary()` and runtime-state read-model tests.

## Detailed Tasks

| ID | Task | Steps | Done Criteria |
|----|------|-------|---------------|
| P03-1 | Add RED tests for split signals | Add docs-only/prompt-only cases expecting task-local complete but whole-plan not accepted | Tests fail on missing fields |
| P03-2 | Add verification summary fields | Compute `taskLocalCompletion` from profile-required planes and freshness; compute `wholePlanAuthority` as evidence eligibility only | Existing fields remain |
| P03-3 | Add read-model projection | Normalize latest verification evidence under `compactStatus.latestVerificationEvidence`; include degraded defaults | Raw payload is not dumped |
| P03-4 | Preserve authority | Keep `verificationPlaneBlocker()` and `assessCompletionAuthority()` based on authority planes and completion decisions | Existing rejection tests pass |
| P03-5 | Update docs/schema | Document projection-only meaning and required read-model fields | Schema/docs match tests |

## Critical Product Scenarios

| ID | User-Visible Expectation | Verification Command | Expected Signal | Evidence Path |
|----|--------------------------|----------------------|-----------------|---------------|
| SCN-03-1 | docs-only evidence can be task-local complete but not whole-plan accepted | `node --test tests/verification-plane-contract.test.mjs tests/completion-authority-contract.test.mjs` | Pass | test output |
| SCN-03-2 | Runtime status exposes latest verification evidence without making it authority | `node --test tests/runtime-read-model-contract.test.mjs` | Pass | test output |

## Exact Execution Targets

| ID | Files To Create | Files To Modify | Files To Test | Commands | Expected Fail/Pass Signals |
|----|-----------------|-----------------|---------------|----------|----------------------------|
| P03-1 | none | verification/runtime tests | targeted tests | `node --test tests/verification-plane-contract.test.mjs tests/runtime-read-model-contract.test.mjs tests/completion-authority-contract.test.mjs` | RED missing fields, GREEN pass |
| P03-2 | none | `scripts/lib/verification-plane.mjs`, `scripts/lib/runtime-state-store.mjs`, schemas/docs | same | same | Existing authority cases unchanged |

## Blockers And Review

- Blocker condition: `taskLocalCompletion` is used to create accepted completion decisions.
- First review checkpoint: After RED tests and before implementation.
- Re-review trigger: Any change to DB schema, authority plane set, or final guard behavior.
- Verification evidence path: test output and `rg` output.

## Validation Plan

- [ ] Split signal tests: `node --test tests/verification-plane-contract.test.mjs tests/runtime-read-model-contract.test.mjs tests/completion-authority-contract.test.mjs`
- [ ] Package gate: `npm run test:package`
- [ ] Eval gate: `npm run test:eval`
- [ ] Full gate: `npm test`
- [ ] Hygiene: `git diff --check`

## Evidence to Mark Done

- docs-only summary shows `taskLocalCompletion.status=complete` and non-accepted `wholePlanAuthority`.
- lowered `--required-planes-json ["quality"]` still cannot create accepted completion.
- full authority evidence still creates accepted completion.
- degraded runtime status includes safe null/default projection fields.

## Deliverables

- Additive verification summary/read-model fields.
- Updated schemas/docs.
- Regression tests proving no gate weakening.

## Phase Completion Checklist

- [ ] RED/GREEN tests prove signal separation
- [ ] No DB schema or authority plane relaxation
- [ ] Degraded output defaults covered
- [ ] Full active gate passes

## Handoff Notes

Phase 04 should reference these read-model signals instead of embedding completion policy details in `completion-verifier` prose.
