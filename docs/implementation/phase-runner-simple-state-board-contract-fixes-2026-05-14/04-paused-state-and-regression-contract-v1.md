# Phase 04: Paused State and Regression Contract (v1)

## Source Mapping
| Req ID | Source Section | Requirement Summary | This Phase Handling |
|--------|----------------|---------------------|---------------------|
| REQ-4.1 | Finding P2 / paused | `paused` is listed in v5 meaningful lifecycle transitions but missing from allowed statuses. | Add lifecycle support and tests. |
| REQ-4.2 | Regression closeout | Existing terminal downgrade and stale terminal scrub behavior must remain valid. | Re-run focused regression matrix. |

## Acceptance Criteria
| AC ID | Source Requirement | Expected Evidence |
|-------|--------------------|-------------------|
| AC-07 | REQ-4.1 | `simple-run-state.test.mjs` covers `active -> paused`, paused startup classification, and `paused -> active` with explicit resume. |
| AC-08 | REQ-4.2 | Lifecycle, lease, invariant, and blocker e2e tests pass after paused support is added. |

## Goal
Complete the lifecycle vocabulary without weakening terminal blocked/complete/cancelled protections.

## Expected Outcome
- `paused` is accepted by the helper.
- Paused projections do not look like running child work.
- `paused -> active` is allowed only through explicit resume flow.
- Existing `blocked + running`, `complete + active`, and stale terminal field scrub protections still pass.

## Phase Execution Metadata
```yaml
phaseExecution:
  schemaVersion: 1
  parallelEligible: false
  parallelGroup: "wave-4"
  dependsOn:
    - "01-current-board-path-unification-v1.md"
    - "02-dispatch-resume-board-validation-v1.md"
    - "03-reconciliation-resume-runner-wiring-v1.md"
  conflictsWith: []
  ownedPaths:
    - ".claude/scripts/lib/simple-run-state.mjs"
    - ".claude/scripts/lib/simple-run-state.test.mjs"
    - ".claude/scripts/lib/harness-state-invariants.test.mjs"
    - ".claude/scripts/lib/lifecycle-projection-writer.test.mjs"
    - ".claude/scripts/lib/phase-run-lease-store.test.mjs"
  readOnlyPaths:
    - ".claude/scripts/moonshot-phase-dispatch.mjs"
    - ".claude/scripts/agent-loop-phase-runner.mjs"
    - ".claude/scripts/blocker-closeout-prevention.e2e.test.mjs"
  sharedMutablePaths: []
  requiresManualEvidence: false
  mergePolicy: "sequential_regression_closeout"
```

## Scope
- In scope:
  - Add `paused` to allowed statuses.
  - Define projection scrub for paused as non-running: `activeExecutionStatus=paused`, `completionStatus=paused`, `childAlive=false`.
  - Add startup behavior: paused board without `--resume` requires resume; paused board with `--resume` can proceed through normal active transition rules.
  - Add invariant checks for paused projections not appearing as running.
- Out of scope:
  - New pause CLI commands.
  - UI/dashboard pause display changes.
  - Auto-resume from paused based on lease or env values.

## Detailed Tasks
| ID | Task | Steps | Done Criteria |
|----|------|-------|---------------|
| P04-1 | Add paused status | Update helper status set and transition matrix. | `paused` no longer throws unsupported status. |
| P04-2 | Define paused scrub | Add target-aware paused projection behavior. | Paused projection cannot report `childAlive=true` or `running`. |
| P04-3 | Add invariant tests | Cover paused plus blocked/running and complete/active existing cases. | Invariant suite detects invalid paused-running contradictions. |
| P04-4 | Run closeout regression | Re-run focused test set from the reviewed closeout. | All listed commands pass. |

## Critical Product Scenarios
| ID | User-Visible Expectation | Verification Command | Expected Signal | Evidence Path |
|----|--------------------------|----------------------|-----------------|---------------|
| SCN-04-1 | Paused lifecycle state is accepted and not treated as running. | `node --test .claude/scripts/lib/simple-run-state.test.mjs` | `active -> paused` passes; projection scrub sets `childAlive=false`. | `.claude/scripts/lib/simple-run-state.test.mjs` |
| SCN-04-2 | Paused run requires explicit resume. | `node --test .claude/scripts/moonshot-phase-dispatch.test.mjs` | No `--resume` returns `resume-required`; `--resume` proceeds after board validation. | `.claude/scripts/moonshot-phase-dispatch.test.mjs` |
| SCN-04-3 | Existing terminal protections still hold. | `node --test .claude/scripts/blocker-closeout-prevention.e2e.test.mjs` | Same-attempt blocked remediation worker is not regenerated. | `.claude/scripts/blocker-closeout-prevention.e2e.test.mjs` |

## Validation Plan
- `node --test .claude/scripts/lib/simple-run-state.test.mjs`
- `node --test .claude/scripts/moonshot-phase-dispatch.test.mjs`
- `node --test .claude/scripts/agent-loop-phase-runner.test.mjs`
- `node --test .claude/scripts/lib/terminal-blocker-publisher.test.mjs`
- `node --test .claude/scripts/lib/lifecycle-projection-writer.test.mjs`
- `node --test .claude/scripts/lib/phase-run-lease-store.test.mjs`
- `node --test .claude/scripts/lib/harness-state-invariants.test.mjs`
- `node --test .claude/scripts/blocker-closeout-prevention.e2e.test.mjs`
- `git diff --check`

## Blockers And Review
- Blocker condition: existing projection vocabulary cannot represent paused without conflicting with current consumers.
- Review checkpoint: paused does not become a new hidden resume intent and does not relax `complete/cancelled -> active`.
- Verification evidence path: `docs/implementation/phase-runner-simple-state-board-contract-fixes-2026-05-14/execution/v1/04-phase-04-paused-state-and-regression-contract/QA_REPORT.md`

## Deliverables
- Paused lifecycle status support.
- Paused projection scrub and invariant tests.
- Full regression command evidence.

## Phase Completion Checklist
- [x] `paused` is an allowed helper status.
- [x] Paused projection is non-running and `childAlive=false`.
- [x] Paused startup requires explicit resume.
- [x] Full regression matrix passes.
