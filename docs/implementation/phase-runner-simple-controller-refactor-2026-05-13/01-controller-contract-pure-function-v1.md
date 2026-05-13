# Phase 01: Controller Contract Pure Function (v1)

## Source Mapping
| Req ID | Source Section | Requirement Summary | This Phase Handling |
|--------|----------------|---------------------|---------------------|
| REQ-1.1 | v13 Controller pure function | Add a pure controller module that reads only normalized input. | Create `phase-loop-controller.mjs` and tests. |
| REQ-1.2 | v13 Controller I/O | Fix output schema and decision vocabulary. | Validate output shape and stable decision ids. |
| REQ-1.3 | v13 Decision mapping | Map stage/result/failureClass cases. | Unit test every required mapping. |

## Acceptance Criteria
| AC ID | Source Requirement | Expected Evidence |
|-------|--------------------|-------------------|
| AC-01 | REQ-1.1 | `node --test .claude/scripts/lib/phase-loop-controller.test.mjs` proves the module is pure and does not read raw Markdown. |
| AC-02 | REQ-1.2 | Tests assert output includes `schemaVersion`, `decision`, `phaseNumber`, `attemptNumber`, `sourceDecisionId`, `retryRecommended`, `failedStage`, `failedCases`, `improvementDirectives`, `evidenceRefs`, and `nextAttemptInput`. |
| AC-03 | REQ-1.3 | Tests cover each required review/verify/finish/checkpoint mapping and the all-pass `clean_finish_candidate` case. |

## Goal
- Establish the controller contract before runner integration.

## Expected Outcome
- A small deterministic module returns one of exactly six decisions from normalized signals.
- Unknown or unsafe cases are conservative and return `blocked` or `repair_required`, not implicit retries.

## Phase Execution Metadata
```yaml
phaseExecution:
  schemaVersion: 1
  parallelEligible: false
  parallelGroup: "wave-1"
  dependsOn: []
  conflictsWith: []
  ownedPaths:
    - ".claude/scripts/lib/phase-loop-controller.mjs"
    - ".claude/scripts/lib/phase-loop-controller.test.mjs"
  readOnlyPaths:
    - ".claude/scripts/agent-loop-phase-runner.mjs"
    - ".claude/scripts/phase-closeout-finalize.mjs"
    - "docs/implementation/phase-runner-simple-controller-refactor-2026-05-13/00-master-plan-v1.md"
  sharedMutablePaths: []
  requiresManualEvidence: false
  mergePolicy: "sequential_foundation"
```

## Scope
- In scope:
  - Export a pure function, for example `decidePhaseLoop(signal)`.
  - Accept only the normalized input shape from the v13 plan.
  - Define the six allowed decisions: `continue_execute`, `rerun_review`, `rerun_verify`, `repair_required`, `blocked`, `clean_finish_candidate`.
  - Generate a stable `sourceDecisionId` from normalized input fields, not file contents.
  - Populate `nextAttemptInput.retryStrategy` conservatively.
  - Normalize unknown finalizer failures to `blocked`, `retryRecommended: false`, and a failed case with `class: "unknown_finalizer_failure"`.
- Out of scope:
  - Reading Markdown, verdict JSON, logs, or filesystem paths.
  - Mutating phase status, runtime state, or execution artifacts.
  - Creating remediation packets.

## Detailed Tasks
| ID | Task | Steps | Done Criteria |
|----|------|-------|---------------|
| P01-1 | Define module and constants | 1) Add controller module. 2) Export allowed decision set. 3) Export validation helper if needed. | Consumers can import decisions without duplicating strings. |
| P01-2 | Implement mapping | 1) Map review failures. 2) Map verify failures. 3) Map finish failures. 4) Map checkpoint failures. 5) Map pass signals. | Every v13 mapping is covered by a unit test. |
| P01-3 | Fix output shape | 1) Fill defaults for arrays. 2) Preserve phase/attempt/stage. 3) Emit retry strategy and evidence refs. | Snapshot or deep-equality tests prove stable schema. |
| P01-4 | Prove purity | 1) No `fs` import in controller. 2) Test passes frozen input. 3) Test asserts no mutation of input object. | Controller can run in isolation without fixtures. |

## Critical Product Scenarios
| ID | User-Visible Expectation | Verification Command | Expected Signal | Evidence Path |
|----|--------------------------|----------------------|-----------------|---------------|
| SCN-01-1 | Review findings that require code change go back to execute, not review. | `node --test .claude/scripts/lib/phase-loop-controller.test.mjs` | `continue_execute` for code-change-required review failure. | `.claude/scripts/lib/phase-loop-controller.test.mjs` |
| SCN-01-2 | Missing verification evidence reruns verification, not code execution. | `node --test .claude/scripts/lib/phase-loop-controller.test.mjs` | `rerun_verify` for missing verification evidence. | `.claude/scripts/lib/phase-loop-controller.test.mjs` |
| SCN-01-3 | Projection/state inconsistency requires repair. | `node --test .claude/scripts/lib/phase-loop-controller.test.mjs` | `repair_required` for projection/state inconsistency. | `.claude/scripts/lib/phase-loop-controller.test.mjs` |
| SCN-01-4 | All pass produces only a finalizer candidate. | `node --test .claude/scripts/lib/phase-loop-controller.test.mjs` | `clean_finish_candidate`; no completed state write. | `.claude/scripts/lib/phase-loop-controller.test.mjs` |

## Exact Execution Targets
| ID | Files To Create | Files To Modify | Files To Test | Commands | Expected Fail/Pass Signals |
|----|-----------------|-----------------|---------------|----------|----------------------------|
| P01-1 | `.claude/scripts/lib/phase-loop-controller.mjs`, `.claude/scripts/lib/phase-loop-controller.test.mjs` | none | same | `node --test .claude/scripts/lib/phase-loop-controller.test.mjs` | exit 0; all six decision cases covered |
| P01-2 | none | none | same | `node --check .claude/scripts/lib/phase-loop-controller.mjs` | exit 0 |

## Blockers And Review
- Blocker condition: mapping requires data that the normalized input shape cannot carry without expanding the contract.
- Review checkpoint: decision vocabulary and retry semantics before runner import.
- Verification evidence path: `docs/implementation/phase-runner-simple-controller-refactor-2026-05-13/execution/v1/01-controller-contract-pure-function/QA_REPORT.md`

## Validation Plan
- [ ] `node --test .claude/scripts/lib/phase-loop-controller.test.mjs`
- [ ] `node --check .claude/scripts/lib/phase-loop-controller.mjs`

## Deliverables
- Pure controller module.
- Unit tests for decision mapping, output shape, immutability, and no raw Markdown reads.

## Phase Completion Checklist
- [ ] Controller returns only the six allowed decisions.
- [ ] Output schema includes `attemptNumber`.
- [ ] `retryRecommended: true` is only a recommendation signal.
- [ ] `clean_finish_candidate` has no completion side effect.

## Handoff Notes
- Phase 02 must convert runner artifacts into this normalized input shape. The controller must remain filesystem-free.
