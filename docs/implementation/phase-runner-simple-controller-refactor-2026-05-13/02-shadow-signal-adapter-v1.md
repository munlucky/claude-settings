# Phase 02: Shadow Signal Adapter (v1)

## Source Mapping
| Req ID | Source Section | Requirement Summary | This Phase Handling |
|--------|----------------|---------------------|---------------------|
| REQ-2.1 | v13 Shadow adapter | Convert Markdown/verdict/gate/finalizer results to normalized signal. | Add thin adapter in the runner or adjacent helper. |
| REQ-2.2 | v13 Shadow mode | Compute controller decision without behavior change and log mismatches. | Add debug mismatch artifact/log path. |

## Acceptance Criteria
| AC ID | Source Requirement | Expected Evidence |
|-------|--------------------|-------------------|
| AC-04 | REQ-2.1 | Tests prove adapter converts review, verify, finish, checkpoint, and pass cases into normalized controller input. |
| AC-05 | REQ-2.2 | Shadow mode logs mismatch while legacy runner behavior remains unchanged. |

## Goal
- Introduce the controller behind the existing runner decision path without changing behavior.

## Expected Outcome
- `agent-loop-phase-runner.mjs` can compute a shadow controller result for review/verify/finish/checkpoint outcomes.
- Mismatches are visible enough for debugging but do not alter current runner decisions.

## Phase Execution Metadata
```yaml
phaseExecution:
  schemaVersion: 1
  parallelEligible: false
  parallelGroup: "wave-2"
  dependsOn:
    - "01"
  conflictsWith: []
  ownedPaths:
    - ".claude/scripts/agent-loop-phase-runner.mjs"
    - ".claude/scripts/agent-loop-phase-runner.test.mjs"
    - ".claude/scripts/lib/phase-loop-controller.mjs"
    - ".claude/scripts/lib/phase-loop-controller.test.mjs"
  readOnlyPaths:
    - ".claude/scripts/phase-closeout-finalize.mjs"
    - ".claude/scripts/verify-phase-closeout.mjs"
    - ".claude/scripts/verify-plan-conformance.mjs"
  sharedMutablePaths: []
  requiresManualEvidence: false
  mergePolicy: "sequential_shared_runner"
```

## Scope
- In scope:
  - Add normalized signal adapter functions for review, verify, finish, checkpoint, and all-pass outcomes.
  - Map finalizer failure codes from v13 into finish-stage normalized signals where the runner sees finalizer results.
  - Add shadow result calculation controlled by a local runner option or internal mode defaulting to behavior-preserving shadow mode.
  - Log mismatch fields: legacy decision, controller decision, phase number, attempt number, stage, failureClass, evidence refs.
- Out of scope:
  - Enforcing the controller decision.
  - Writing remediation packets.
  - Changing finalizer/verifier pass criteria.

## Adapter Contract
```yaml
normalizedSignal:
  phaseNumber: "number"
  attemptNumber: "number"
  stage: "execute | review | verify | finish | checkpoint"
  result: "pass | fail | partial | blocked"
  failureClass: "string"
  failedCases: []
  evidenceRefs: []
  blockers: []
  previousRemediation: null
```

Finalizer adapter mapping:
- `verification-verdict-not-passed` -> `stage=finish`, `result=fail`, `failureClass=missing_verification_evidence`.
- `review-evidence-missing` -> `stage=finish`, `result=fail`, `failureClass=missing_review_evidence`.
- `phase-status-inconsistent`, `current-artifacts-stale`, `workflow-state-failed` -> `stage=finish`, `result=fail`, `failureClass=projection_state_inconsistency`.
- `tool-unavailable` or `spawn EPERM` -> `stage=finish`, `result=blocked`, `failureClass=environment_unavailable`.
- Unknown finalizer failure -> controller receives enough context to return `blocked`, `retryRecommended=false`, `unknown_finalizer_failure`.

## Detailed Tasks
| ID | Task | Steps | Done Criteria |
|----|------|-------|---------------|
| P02-1 | Add adapter | 1) Locate runner branch points. 2) Add adapter helper. 3) Keep Markdown parsing outside controller. | Adapter output matches controller input schema. |
| P02-2 | Add shadow calculation | 1) Import controller. 2) Compute shadow decision near existing branch. 3) Preserve legacy return path. | Tests prove behavior does not change in shadow mode. |
| P02-3 | Log mismatch | 1) Emit structured debug object. 2) Include enough source ids. 3) Avoid using mismatch as completion evidence. | Mismatch artifact/log is inspectable and non-blocking. |

## Critical Product Scenarios
| ID | User-Visible Expectation | Verification Command | Expected Signal | Evidence Path |
|----|--------------------------|----------------------|-----------------|---------------|
| SCN-02-1 | Shadow controller mismatch is observable but does not reroute the runner. | `node --test .claude/scripts/agent-loop-phase-runner.test.mjs .claude/scripts/lib/phase-loop-controller.test.mjs` | shadow mismatch fixture keeps legacy decision. | `.claude/scripts/agent-loop-phase-runner.test.mjs` |
| SCN-02-2 | Finalizer failure codes become normalized finish signals. | `node --test .claude/scripts/agent-loop-phase-runner.test.mjs` | known failure code fixtures map to expected failure classes. | `.claude/scripts/agent-loop-phase-runner.test.mjs` |

## Exact Execution Targets
| ID | Files To Create | Files To Modify | Files To Test | Commands | Expected Fail/Pass Signals |
|----|-----------------|-----------------|---------------|----------|----------------------------|
| P02-1 | optional runner test fixtures | `.claude/scripts/agent-loop-phase-runner.mjs` | `.claude/scripts/agent-loop-phase-runner.test.mjs`, `.claude/scripts/lib/phase-loop-controller.test.mjs` | `node --test .claude/scripts/agent-loop-phase-runner.test.mjs .claude/scripts/lib/phase-loop-controller.test.mjs` | exit 0; shadow fixture is behavior-preserving |
| P02-2 | none | `.claude/scripts/agent-loop-phase-runner.mjs` | syntax | `node --check .claude/scripts/agent-loop-phase-runner.mjs` | exit 0 |

## Blockers And Review
- Blocker condition: existing runner has no test harness for branch decisions; add the narrowest fixture instead of broad refactor.
- Review checkpoint: adapter must not import filesystem behavior into the controller module.
- Verification evidence path: `docs/implementation/phase-runner-simple-controller-refactor-2026-05-13/execution/v1/02-shadow-signal-adapter/QA_REPORT.md`

## Validation Plan
- [ ] `node --test .claude/scripts/agent-loop-phase-runner.test.mjs .claude/scripts/lib/phase-loop-controller.test.mjs`
- [ ] `node --check .claude/scripts/agent-loop-phase-runner.mjs`

## Deliverables
- Normalized signal adapter.
- Shadow controller calculation and mismatch logging.
- Tests proving no behavior change in shadow mode.

## Phase Completion Checklist
- [ ] Adapter converts all required stage/result/failureClass cases.
- [ ] Shadow mismatch is logged without changing runner behavior.
- [ ] Controller still never reads Markdown or artifacts directly.

## Handoff Notes
- Phase 03 may enforce only after Phase 02 evidence shows the adapter has stable normalized signals.
