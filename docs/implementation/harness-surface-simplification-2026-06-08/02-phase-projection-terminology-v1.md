# Phase 02: Phase Projection Terminology (v1)

## Source Mapping

| Req ID | Source Section | Requirement Summary | This Phase Handling |
|--------|----------------|---------------------|---------------------|
| SRC-2 | Harness surface plan | Clarify `phase-status.yaml` as projection/cursor only | Updates runner docs, references, templates, and tests |

## Goal

Make every runner-facing surface describe `phase-status.yaml` as a phase cursor projection only, while `runtime-state.sqlite` remains the authority for blocker, resume reconstruction, run state, and whole-plan completion.

## Expected Outcome

No active skill, runner reference, or execution template implies that `phase-status.yaml` is completion authority or blocker/resume authority.

## Phase Execution Metadata

```yaml
phaseExecution:
  schemaVersion: 1
  parallelEligible: true
  parallelGroup: wave-1
  dependsOn: []
  conflictsWith:
    - 01-legacy-archive-contract-split-v1
  ownedPaths:
    - skills/moonshot-phase-runner/SKILL.md
    - skills/moonshot-phase-runner/SKILL.ko.md
    - skills/moonshot-phase-runner/references/control-plane.md
    - skills/moonshot-in-session-coordinator/SKILL.md
    - skills/moonshot-in-session-coordinator/SKILL.ko.md
    - docs/public/reference/phase-runner-user-workflow.md
    - docs/public/reference/phase-final-guard-hooks.md
    - templates/execution/PHASE_COORDINATOR_CONTRACT.md
    - tests/workflow-e2e-contract.test.mjs
  readOnlyPaths:
    - scripts/phase-final-guard.mjs
    - scripts/runtime-state.mjs
    - scripts/lib/runtime-state-*
    - .moonshot-relay/**
    - .claude/**
    - .codex/**
  sharedMutablePaths:
    - tests/workflow-e2e-contract.test.mjs
  requiresManualEvidence: false
  mergePolicy: coordinated_shared_tests
```

## Scope

- In scope:
  - Replace unsafe wording such as `phaseStatusFile ... authoritative for this run`.
  - Align English and Korean runner skills.
  - Add regression tests for projection-only wording.
- Out of scope:
  - Renaming `phase-status.yaml`.
  - Changing `phase-final-guard.mjs` behavior.
  - Changing accepted completion logic.

## Preconditions and Inputs

- Required docs:
  - `00-master-plan-v1.md`
- Required code/data:
  - Baseline `rg -n "phaseStatusFile.*authoritative|Runtime status: active.*phase-status|phase-status.yaml.*authority" skills docs templates tests`.

## Detailed Tasks

| ID | Task | Steps | Done Criteria |
|----|------|-------|---------------|
| P02-1 | Add wording regression tests | Extend workflow E2E tests to inspect runner skills, Korean skills, references, and `PHASE_COORDINATOR_CONTRACT.md` | Unsafe authority wording fails tests |
| P02-2 | Normalize template wording | Change `PHASE_COORDINATOR_CONTRACT.md` to call `phaseStatusFile` a supplied cursor/projection path, not authority | Attempt input cannot spread bad wording |
| P02-3 | Normalize runner docs | Update phase-runner and coordinator docs to say `phase-status.yaml` selects next actionable phase only | English and Korean docs match |
| P02-4 | Preserve gate behavior | Keep final guard logic unchanged and verify existing projection-only completion blockers pass | No behavior regression |

## Critical Product Scenarios

| ID | User-Visible Expectation | Verification Command | Expected Signal | Evidence Path |
|----|--------------------------|----------------------|-----------------|---------------|
| SCN-02-1 | Generated/seeded phase instructions do not call projection authoritative | `node --test tests/workflow-e2e-contract.test.mjs` | Pass | test output |
| SCN-02-2 | Phase projection still cannot satisfy completion | `node --test tests/completion-authority-contract.test.mjs tests/phase-final-guard-contract.test.mjs` | Pass | test output |

## Exact Execution Targets

| ID | Files To Create | Files To Modify | Files To Test | Commands | Expected Fail/Pass Signals |
|----|-----------------|-----------------|---------------|----------|----------------------------|
| P02-1 | none | `tests/workflow-e2e-contract.test.mjs` | `tests/workflow-e2e-contract.test.mjs` | `node --test tests/workflow-e2e-contract.test.mjs` | RED catches unsafe wording, GREEN passes |
| P02-2 | none | runner docs and template | completion/guard tests | `node --test tests/completion-authority-contract.test.mjs tests/phase-final-guard-contract.test.mjs` | Pass, no logic change |

## Blockers And Review

- Blocker condition: Any wording implies phase closeout or whole-plan closeout can be proven by `phase-status.yaml`.
- First review checkpoint: After template wording is changed.
- Re-review trigger: Korean skill docs diverge from English authority wording.
- Verification evidence path: `rg` output and focused test output.

## Validation Plan

- [ ] Wording regression: `node --test tests/workflow-e2e-contract.test.mjs`
- [ ] Completion behavior: `node --test tests/completion-authority-contract.test.mjs tests/phase-final-guard-contract.test.mjs`
- [ ] Full active gate: `npm test`
- [ ] Hygiene: `git diff --check`

## Evidence to Mark Done

- `rg -n "phase cursor projection|loop-cursor projection|runtime-state.sqlite.*authority" skills docs templates tests` shows intended wording.
- `rg -n "phaseStatusFile.*authoritative|Runtime status: active.*phase-status.yaml" skills docs templates` returns no unsafe matches.
- Existing phase-status-only completion rejection tests pass.

## Deliverables

- Runner and template wording aligned to projection-only model.
- Regression tests covering English, Korean, and template surfaces.

## Phase Completion Checklist

- [ ] Unsafe wording tests added
- [ ] Template wording corrected
- [ ] English/Korean skill docs aligned
- [ ] Final guard behavior unchanged and tests pass

## Handoff Notes

Phase 03 should use the same terminology for `latestVerificationEvidence`, `taskLocalCompletion`, and `wholePlanAuthority` to avoid reintroducing authority ambiguity.
