# Phase 01: Phase Execution Paths And Sidecar Reader (v1)

## Source Mapping
| Req ID | Source Section | Requirement Summary | This Phase Handling |
|--------|----------------|---------------------|---------------------|
| REQ-1.1 | v8 Slice 1 | Add resolver and sidecar/manifest reader. | Create path resolver and reader APIs. |
| REQ-1.2 | v8 Core Contract | Sidecar or manifest forces sidecar canonical mode. | Implement mode detection. |
| REQ-2.1 | v8 Core Contract | Open blocker is latest record per id. | Implement latest-status reducer. |

## Acceptance Criteria
| AC ID | Source Requirement | Expected Evidence |
|-------|--------------------|-------------------|
| AC-01 | REQ-1.1 | Unit tests for active and `close/` archived execution dir resolution. |
| AC-02 | REQ-1.2 | Unit tests for `legacy_verifier`, `sidecar_canonical`, `manifest_sidecar_missing`, and `incomplete_transaction`. |
| AC-03 | REQ-2.1 | Unit tests for `open -> resolved` and `open -> resolved -> regressed` latest status folding. |

## Goal
- Provide one canonical resolver and reader layer for blocker sidecar data without changing runtime pointers or existing active plan documents.

## Expected Outcome
- Later phases can consume `phase-execution-paths` and sidecar reader APIs instead of path-string reconstruction.

## Phase Execution Metadata
```yaml
phaseExecution:
  schemaVersion: 1
  parallelEligible: false
  parallelGroup: "wave-1"
  dependsOn: []
  conflictsWith: []
  ownedPaths:
    - ".claude/scripts/lib/phase-execution-paths.mjs"
    - ".claude/scripts/lib/phase-execution-paths.test.mjs"
    - ".claude/scripts/lib/blocker-sidecar-state.mjs"
    - ".claude/scripts/lib/blocker-sidecar-state.test.mjs"
  readOnlyPaths:
    - ".claude/docs/phase-status.yaml"
    - ".claude/logs/workflow-enforcement/current-run.json"
    - ".claude/logs/workflow-enforcement/active-phase-run.json"
    - ".claude/logs/workflow-enforcement/latest-dispatch.json"
    - "docs/implementation/residual-harness-anomaly-v4-2026-05-12/**"
  sharedMutablePaths: []
  requiresManualEvidence: false
  mergePolicy: "sequential_foundation"
```

## Scope
- In scope:
  - `resolvePhaseExecutionDir({ planDir, executionRoot, phaseNumber, phaseSlug, phaseDoc })`
  - sidecar path resolution for `BLOCKER_EVIDENCE.jsonl`, `ATTEMPT_LEDGER.jsonl`, `projection-manifest.json`
  - JSONL reader with dedupe and latest status reducer
  - mode detection: `legacy_verifier`, `sidecar_canonical`, `manifest_sidecar_missing`, `incomplete_transaction`
- Out of scope:
  - publisher writes
  - lifecycle writer guard
  - verifier behavior changes outside unit tests
  - active runtime pointer preparation

## Preconditions and Inputs
- Required docs:
  - `docs/implementation/blocker-closeout-prevention-2026-05-12/00-master-plan-v1.md`
- Required code:
  - Existing path conventions in `.claude/scripts/agent-loop-phase-artifacts.mjs`
  - Existing archived phase doc conventions under `docs/implementation/*/close`

## Detailed Tasks
| ID | Task | Steps | Done Criteria |
|----|------|-------|---------------|
| P01-1 | Add path resolver | 1) Create resolver module. 2) Support active execution root. 3) Support `close/` archived phase doc fallback. | Resolver returns stable sidecar paths for active and archived cases. |
| P01-2 | Add JSONL reader | 1) Parse line-delimited JSON defensively. 2) Deduplicate by `id` for blocker evidence. 3) Deduplicate by `attemptId + transactionId` for attempt ledger. | Invalid lines are reported as diagnostics; valid records remain usable. |
| P01-3 | Add latest blocker reducer | 1) Group by `id`. 2) Pick latest record by append order or timestamp. 3) Classify latest `open|regressed` as active and `resolved` as historical. | Reducer matches v8 open blocker contract. |
| P01-4 | Add mode detection | 1) Detect sidecar and manifest existence. 2) Return legacy only when both absent. 3) Return explicit failure modes for partial states. | Tests cover all mode branches. |

## Critical Product Scenarios
| ID | User-Visible Expectation | Verification Command | Expected Signal | Evidence Path |
|----|--------------------------|----------------------|-----------------|---------------|
| SCN-01-1 | A legacy completed run without sidecars still verifies through legacy mode. | `node --test .claude/scripts/lib/blocker-sidecar-state.test.mjs` | `legacy_verifier` case passes. | `.claude/scripts/lib/blocker-sidecar-state.test.mjs` |
| SCN-01-2 | A manifest without sidecar is not silently treated as legacy. | `node --test .claude/scripts/lib/blocker-sidecar-state.test.mjs` | `manifest_sidecar_missing` case passes. | `.claude/scripts/lib/blocker-sidecar-state.test.mjs` |
| SCN-01-3 | A resolved blocker does not stay open forever. | `node --test .claude/scripts/lib/blocker-sidecar-state.test.mjs` | `open -> resolved` latest status is historical. | `.claude/scripts/lib/blocker-sidecar-state.test.mjs` |

## Exact Execution Targets
| ID | Files To Create | Files To Modify | Files To Test | Commands | Expected Fail/Pass Signals |
|----|-----------------|-----------------|---------------|----------|----------------------------|
| P01-1 | `.claude/scripts/lib/phase-execution-paths.mjs`, `.claude/scripts/lib/phase-execution-paths.test.mjs` | none | same | `node --test .claude/scripts/lib/phase-execution-paths.test.mjs` | exit 0 |
| P01-2 | `.claude/scripts/lib/blocker-sidecar-state.mjs`, `.claude/scripts/lib/blocker-sidecar-state.test.mjs` | none | same | `node --test .claude/scripts/lib/blocker-sidecar-state.test.mjs` | exit 0 |

## Blockers And Review
- Blocker condition: resolver cannot unambiguously map a phase doc to a phase execution directory.
- First review checkpoint: after reader API shape is stable but before other scripts import it.
- Re-review trigger: any caller starts composing sidecar paths manually.
- Verification evidence path: `docs/implementation/blocker-closeout-prevention-2026-05-12/execution/blocker-closeout-prevention-v1/01-phase-execution-paths-sidecar-reader/QA_REPORT.md`

## Validation Plan
- [ ] `node --test .claude/scripts/lib/phase-execution-paths.test.mjs`
- [ ] `node --test .claude/scripts/lib/blocker-sidecar-state.test.mjs`
- [ ] `node --check .claude/scripts/lib/phase-execution-paths.mjs`
- [ ] `node --check .claude/scripts/lib/blocker-sidecar-state.mjs`

## Deliverables
- Resolver module.
- Sidecar reader module.
- Focused unit tests.

## Phase Completion Checklist
- [ ] Resolver handles active and archived execution paths.
- [ ] Sidecar mode detection preserves legacy compatibility.
- [ ] Latest blocker status reducer is tested.
- [ ] No active runtime pointer or `residual-harness-anomaly-v4` document was modified.

## Handoff Notes
- Phase 02 must import the sidecar reader instead of reimplementing mode detection.
