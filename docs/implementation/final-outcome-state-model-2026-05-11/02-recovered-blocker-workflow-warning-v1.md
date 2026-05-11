# Phase 02: Recovered Blocker And Workflow Warning Projection (v1)

## Source Mapping
| Req ID | AC ID | Source Section | Requirement Summary | This Phase Handling |
|--------|-------|----------------|---------------------|---------------------|
| REQ-1.5 | AC-05 | Plan v8 / Recovered blocker handling | Empty or clean complete fields must not create recovered blockers; stale blockers dedupe by normalized fingerprint. | Normalize blocker fields and preserve existing `recoveredAt` on duplicate fingerprints. |
| REQ-1.6 | AC-06 | Plan v8 / Workflow state projection | Completion vocabulary must not become warning history. | Filter warning candidates and keep real historical failures in `nonBlockingWarnings[]` and `attemptHistory[]`. |

## Goal
- Preserve real historical warnings without misclassifying clean complete fields or completion vocabulary as active blockers.

## Expected Outcome
- `success_with_warning` means the run has auditable warning history through `recoveredBlockers[]` or `nonBlockingWarnings[]`.
- Active blocker scalar fields remain present but empty after clean completion.
- `latest-dispatch.json.status=superseded` is not treated as running or failed.
- `delegated-terminal-exit-1` is historical warning data when recovered, not an active failure.

## Phase Execution Metadata
```yaml
phaseExecution:
  schemaVersion: 1
  parallelEligible: false
  parallelGroup: "wave-2"
  dependsOn: ["01"]
  conflictsWith: ["03", "04"]
  ownedPaths:
    - ".claude/scripts/phase-closeout-finalize.mjs"
    - ".claude/scripts/phase-closeout-finalize.test.mjs"
    - ".claude/scripts/workflow-enforcement.mjs"
    - ".claude/scripts/verify-phase-closeout.mjs"
    - ".claude/scripts/verify-phase-closeout.test.mjs"
  readOnlyPaths:
    - ".claude/scripts/lib/final-outcome-projection.mjs"
    - ".claude/logs/workflow-enforcement/current-run.json"
    - ".claude/logs/workflow-enforcement/active-phase-run.json"
    - ".claude/logs/workflow-enforcement/latest-dispatch.json"
  sharedMutablePaths: []
  requiresManualEvidence: false
  mergePolicy: "sequential_warning_projection"
```

## Scope
- In scope:
  - Recovered blocker fingerprint normalization where `undefined`, `null`, and `""` are the same empty value.
  - Dedupe `recoveredBlockers[]` while preserving existing `recoveredAt`.
  - Copy `lastRecoveredBlocker` from the normalized object in `recoveredBlockers[]`.
  - Completion vocabulary exclusion from warnings.
  - `latest-dispatch.json.status=superseded` handling.
- Out of scope:
  - Summary rendering text.
  - Repository closeout status.
  - Runtime parity classifier.

## Preconditions and Inputs
- Phase 01 helper is available.
- Fixtures cover:
  - Clean complete with no active blocker fields.
  - Stale blocker fields from recovered delegated-terminal failure.
  - Duplicate stale blocker fingerprint on repeated finalizer runs.
  - Workflow state with `status=superseded`.

## Detailed Tasks
| ID | Task | Steps | Done Criteria |
|----|------|-------|---------------|
| P02-1 | Normalize blocker fingerprint | Add a small normalization function for blocker scalar/object fields. | Empty values do not create recovered blockers; duplicate fingerprints compare equal. |
| P02-2 | Dedupe recovered blockers | Before appending, check existing normalized fingerprint and preserve existing `recoveredAt`. | Repeated finalizer run does not append duplicates or update `recoveredAt`. |
| P02-3 | Filter completion vocabulary | Exclude `scope_complete`, `clean_complete`, `success`, `success_with_warning`, `complete`, `completed` from warning candidates. | Completion-only workflow states do not populate `nonBlockingWarnings[]`. |
| P02-4 | Preserve real historical failures | Keep real past failures in `nonBlockingWarnings[]` and `attemptHistory[]` without making them active blockers. | Recovered delegated failure yields `success_with_warning` with active failed count zero. |

## Critical Product Scenarios
| ID | User-Visible Expectation | Verification Command | Expected Signal | Evidence Path |
|----|--------------------------|----------------------|-----------------|---------------|
| SCN-02-1 | A completed run with no blocker history stays clean success. | `node --test .claude/scripts/phase-closeout-finalize.test.mjs` | no new `recoveredBlockers[]`; verdict `success`. | terminal test output |
| SCN-02-2 | A recovered delegated-terminal failure remains historical warning only. | `node --test .claude/scripts/verify-phase-closeout.test.mjs .claude/scripts/phase-closeout-finalize.test.mjs` | `success_with_warning`, active blocker fields empty, warning retained. | terminal test output |
| SCN-02-3 | `latest-dispatch.json.status=superseded` is not treated as running. | `node --test .claude/scripts/verify-phase-closeout.test.mjs` | verifier accepts superseded latest dispatch for final completed run. | terminal test output |

## Exact Execution Targets
| ID | Files To Create | Files To Modify | Files To Test | Commands | Expected Fail/Pass Signals |
|----|-----------------|-----------------|---------------|----------|----------------------------|
| P02-1 | none | `.claude/scripts/phase-closeout-finalize.mjs` | `.claude/scripts/phase-closeout-finalize.test.mjs` | `node --test .claude/scripts/phase-closeout-finalize.test.mjs` | Tests prove empty blocker fields do not become recovered blockers. |
| P02-3 | none | `.claude/scripts/workflow-enforcement.mjs`, `.claude/scripts/verify-phase-closeout.mjs` | `.claude/scripts/verify-phase-closeout.test.mjs` | `node --test .claude/scripts/verify-phase-closeout.test.mjs` | Completion vocabulary excluded; superseded dispatch accepted. |

## Blockers And Review
- Blocker condition: `success_with_warning` is derived from active blocker scalar fields instead of auditable historical arrays.
- First review checkpoint: recovered blocker fingerprint uses normalized object values, not JSON stringification of raw input.
- Re-review trigger: workflow projection adds completion vocabulary to `nonBlockingWarnings[]`.
- Verification evidence path: targeted node test output.

## Validation Plan
- [ ] `node --test .claude/scripts/phase-closeout-finalize.test.mjs`
- [ ] `node --test .claude/scripts/verify-phase-closeout.test.mjs`
- [ ] `pwsh -NoProfile -File .claude/scripts/run-node-tests-direct.ps1 .claude/scripts/*.test.mjs`

## Evidence to Mark Done
- Passing recovered blocker dedupe tests.
- Passing workflow completion vocabulary tests.
- Fixture showing `latest-dispatch.json.status=superseded` is accepted as final closeout state.

## Deliverables
- Recovered blocker normalization/dedupe behavior.
- Workflow warning projection updates.
- Closeout verifier coverage.

## Phase Completion Checklist
- [ ] Clean complete fields do not create recovered blockers.
- [ ] Duplicate recovered blocker fingerprints do not append or refresh `recoveredAt`.
- [ ] `lastRecoveredBlocker` is copied from the matching normalized object.
- [ ] Completion vocabulary is excluded from warnings.
- [ ] Real historical failure remains warning history only.

## Handoff Notes
- Phase 03 should render historical warnings from `recoveredBlockers[]` and `nonBlockingWarnings[]`, never from active blocker scalar fields.
