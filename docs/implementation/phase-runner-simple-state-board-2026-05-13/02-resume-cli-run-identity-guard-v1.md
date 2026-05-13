# Phase 02: Resume CLI and Run Identity Guard (v1)

## Source Mapping
| Req ID | Source Section | Requirement Summary | This Phase Handling |
|--------|----------------|---------------------|---------------------|
| REQ-2.1 | v5 / `--resume` CLI | Add public `--resume` boolean option and propagate it to child runners. | Modify CLI parsing/help and invocation args. |
| REQ-2.2 | v5 / run identity | Do not overwrite global compatibility files with a different `stateRunId`. | Add startup and projection identity guards. |

## Acceptance Criteria
| AC ID | Source Requirement | Expected Evidence |
|-------|--------------------|-------------------|
| AC-04 | REQ-2.1 | `node --test .claude/scripts/moonshot-phase-dispatch.test.mjs` proves parser/help includes `--resume` and dispatch forwards it. |
| AC-05 | REQ-2.2 | Tests prove mismatched `stateRunId` in global projection causes hard reject before merge/overwrite. |
| AC-05A | REQ-2.1, REQ-2.2 | Named negative test `no_implicit_resume_sources` proves `PHASE_RUN_LEASE_ID`, existing lease files, env values, and reconciliation file presence do not count as resume intent without `--resume`. |

## Goal
- Make resume explicit and prevent new runs from inheriting or overwriting active/blocked state from another run.

## Expected Outcome
- Dispatch, agent-loop, and phase-runner all understand `--resume`.
- Without `--resume`, an existing active/blocked board returns `resume-required`.
- With `--resume` but no valid board, startup returns `resume-state-missing`.
- `PHASE_RUN_LEASE_ID`, existing lease files, env values, and reconciliation file presence return the same no-resume path unless `--resume` is present.
- Compatibility projections always carry `stateRunId`.

## Phase Execution Metadata
```yaml
phaseExecution:
  schemaVersion: 1
  parallelEligible: false
  parallelGroup: "wave-2"
  dependsOn:
    - "01-simple-run-state-helper-v1"
  conflictsWith: []
  ownedPaths:
    - ".claude/scripts/moonshot-phase-dispatch.mjs"
    - ".claude/scripts/moonshot-phase-dispatch.test.mjs"
    - ".claude/scripts/agent-loop.mjs"
    - ".claude/scripts/agent-loop-phase-runner.mjs"
    - ".claude/scripts/agent-loop-phase-runner.test.mjs"
  readOnlyPaths:
    - ".claude/scripts/lib/simple-run-state.mjs"
    - ".claude/logs/workflow-enforcement/current-run.json"
    - ".claude/logs/workflow-enforcement/active-phase-run.json"
    - ".claude/logs/workflow-enforcement/latest-dispatch.json"
  sharedMutablePaths: []
  requiresManualEvidence: false
  mergePolicy: "sequential_cli_surface"
```

## Scope
- In scope:
  - Add `--resume` to help and parser in `moonshot-phase-dispatch.mjs`.
  - Propagate `--resume` to `agent-loop.mjs` and `agent-loop-phase-runner.mjs`.
  - Add `--resume` parsing in `agent-loop.mjs` and `agent-loop-phase-runner.mjs`.
  - Call startup classification from `simple-run-state.mjs`.
  - Add `stateRunId` to compatibility projection payloads where this phase touches writes.
- Out of scope:
  - Terminal blocker sidecar reconciliation.
  - Changing the current active `.claude/docs/phase-status.yaml`.

## Detailed Tasks
| ID | Task | Steps | Done Criteria |
|----|------|-------|---------------|
| P02-1 | Add public CLI option | 1) Update help text. 2) Add parser boolean. 3) Thread state through launch args. | Dispatch test sees `--resume` in help and child command args. |
| P02-2 | Add startup guard | 1) Read `STATE.md`. 2) Classify no-resume active/blocked as `resume-required`. 3) Classify resume without board as `resume-state-missing`. | Runner aborts before worker spawn on invalid resume state. |
| P02-3 | Add stateRunId projection guard | 1) Inspect previous payload before write. 2) Reject mismatch. 3) Preserve current run id in new writes. | Unit tests catch mismatch overwrite. |
| P02-4 | Add no implicit resume negative test | 1) Set `PHASE_RUN_LEASE_ID`. 2) Create existing lease/env/reconciliation fixtures. 3) Omit `--resume`. | `no_implicit_resume_sources` returns `resume-required` or no-resume startup classification. |

## Critical Product Scenarios
| ID | User-Visible Expectation | Verification Command | Expected Signal | Evidence Path |
|----|--------------------------|----------------------|-----------------|---------------|
| SCN-02-1 | Starting a new run does not continue an old blocked board silently. | `node --test .claude/scripts/moonshot-phase-dispatch.test.mjs` | no `--resume` + blocked board returns `resume-required`. | `.claude/scripts/moonshot-phase-dispatch.test.mjs` |
| SCN-02-2 | Resume is explicit and preserves `stateRunId`. | `node --test .claude/scripts/moonshot-phase-dispatch.test.mjs` | `--resume` forwards to child runner and retains board run id. | `.claude/scripts/moonshot-phase-dispatch.test.mjs` |
| SCN-02-3 | Runtime artifacts and env values cannot silently authorize resume. | `node --test .claude/scripts/agent-loop-phase-runner.test.mjs` | `no_implicit_resume_sources` fixture rejects `PHASE_RUN_LEASE_ID`, existing lease, env values, and reconciliation file presence without `--resume`. | `.claude/scripts/agent-loop-phase-runner.test.mjs` |

## Exact Execution Targets
| ID | Files To Create | Files To Modify | Files To Test | Commands | Expected Fail/Pass Signals |
|----|-----------------|-----------------|---------------|----------|----------------------------|
| P02-1 | none | `.claude/scripts/moonshot-phase-dispatch.mjs`, `.claude/scripts/agent-loop.mjs`, `.claude/scripts/agent-loop-phase-runner.mjs` | `.claude/scripts/moonshot-phase-dispatch.test.mjs`, `.claude/scripts/agent-loop-phase-runner.test.mjs` | `node --test .claude/scripts/moonshot-phase-dispatch.test.mjs` | exit 0; `--resume` help/parser/forwarding fixture passes |
| P02-2 | none | `.claude/scripts/agent-loop.mjs`, `.claude/scripts/agent-loop-phase-runner.mjs` | `.claude/scripts/agent-loop-phase-runner.test.mjs` | `node --test .claude/scripts/agent-loop-phase-runner.test.mjs` | exit 0; startup guard cases pass |
| P02-4 | none | `.claude/scripts/agent-loop-phase-runner.mjs` | `.claude/scripts/agent-loop-phase-runner.test.mjs` | `node --test .claude/scripts/agent-loop-phase-runner.test.mjs` | exit 0; `no_implicit_resume_sources` negative fixture passes |

## Blockers And Review
- Blocker condition: existing parser test structure cannot inspect generated child args without refactor; stop and add a small exported parser helper instead of shelling out broadly.
- Review checkpoint: public CLI compatibility and no-resume default before integrating projections.
- Verification evidence path: `docs/implementation/phase-runner-simple-state-board-2026-05-13/execution/v1/02-phase-02-resume-cli-run-identity-guard/QA_REPORT.md`

## Validation Plan
- [ ] `node --test .claude/scripts/moonshot-phase-dispatch.test.mjs`
- [ ] `node --test .claude/scripts/agent-loop-phase-runner.test.mjs`
- [ ] `node --check .claude/scripts/moonshot-phase-dispatch.mjs`

## Deliverables
- Public `--resume` option.
- Startup guard for resume-required and resume-state-missing.
- Named negative test expectation: `no_implicit_resume_sources`.
- `stateRunId` mismatch rejection before projection overwrite.

## Phase Completion Checklist
- [ ] `--resume` appears in help.
- [ ] `--resume` is propagated to child runners.
- [ ] Env/lease/file presence alone is not treated as resume.
- [ ] Mismatched `stateRunId` blocks overwrite.
