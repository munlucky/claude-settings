# Phase Runner State Board Runtime Contract Fixes Master Plan v1

> This document is the plan of all plans for closing the remaining runtime contract gaps found after commit `f56a4f7fc12476fec685af87a6122ddd7449e874`.

## Source Baseline
- User review findings from 2026-05-14 (role: scope/priority)
- `docs/implementation/phase-runner-simple-state-board-2026-05-13/00-master-plan-v1.md` (role: original v5 technical contract)
- `docs/implementation/phase-runner-simple-state-board-contract-fixes-2026-05-14/00-master-plan-v1.md` (role: prior fix package and remaining gap context)
- Current code review over `f56a4f7fc12476fec685af87a6122ddd7449e874..HEAD` (role: brownfield evidence)

## Objective
Close the remaining gap between the v5 state-board public contract and the actual runtime paths. The fix must make terminal blocked outcomes update `STATE.md`, align reconciliation evidence lookup with publisher output, make active transition commit semantics truthful, and teach invariants to compare `STATE.md` with compatibility projections.

## Goal Contract
```yaml
goalContract:
  schemaVersion: 1
  goalClarity: 0.96
  scopeClarity: 0.95
  acceptanceCriteriaClarity: 0.94
  verificationClarity: 0.94
  clarityScore: 0.95
  ambiguityScore: 0.05
  readinessDecision: pass
  nonGoals:
    - "Do not redesign the state model into SQLite or event sourcing."
    - "Do not change canonical terminal evidence away from BLOCKER_EVIDENCE.jsonl, ATTEMPT_LEDGER.jsonl, and projection-manifest.json."
    - "Do not prepare runnable phase state in this planning task."
```

## Plan Quality Loop
```yaml
planQualityReview:
  schemaVersion: 1
  finalIteration: 2
  isolationMode: "forked"
  maxIterations: 4
  targetAmbiguityScore: 0.20
  blockedAmbiguityScore: 0.35
  totalScore: 0.936
  ambiguityScore: 0.064
  decision: "pass"
  reviewerSessions:
    - "019e24fc-20ab-7461-a99f-3b9554495b0c"
    - "019e2502-116b-7131-b80d-30e3b6aa7b38"
  writerSessions:
    - "isolated-writer-current-session-2026-05-14"
  artifactRoot: "docs/implementation/phase-runner-state-board-runtime-contract-fixes-2026-05-14/planning-loop"
  latestReview: "docs/implementation/phase-runner-state-board-runtime-contract-fixes-2026-05-14/planning-loop/plan-quality-review-iter-02.yaml"
  latestWriterRevision: "docs/implementation/phase-runner-state-board-runtime-contract-fixes-2026-05-14/planning-loop/plan-writer-revision-iter-01.yaml"
  blockingFindings: []
  remainingImprovementDirectives: []
  remainingOpenDecisions: []
```

- Strict plan review loop is required for this package.
- Isolated Reviewer Agent iteration 2 returned `decision: pass` with `ambiguityScore: 0.064`, no blocking findings, and no improvement directives.
- Runnable preparation remains a separate gate and must use `prepare-implementation-plan-state.mjs --dry-run` before any phase-runner dispatch.

## Phase Index
| Phase | Title | Plan File | Depends On |
|------|-------|-----------|------------|
| 01 | Terminal Blocked Board Publish Wiring | `01-terminal-blocked-board-publish-wiring-v1.md` | - |
| 02 | Reconciliation Evidence Path Unification | `02-reconciliation-evidence-path-unification-v1.md` | 01 |
| 03 | Active Transition Projection Commit Semantics | `03-active-transition-projection-commit-semantics-v1.md` | 01 |
| 04 | Board Projection Invariant Coverage | `04-board-projection-invariant-coverage-v1.md` | 01, 02, 03 |

## Execution Order Notes
- Phase 01 must land first because terminal blocked board state is the guard input for same-attempt retry prevention.
- Phase 02 depends on Phase 01 because the publisher and runner must agree on the evidence location written during terminal publish.
- Phase 03 can be developed after Phase 01, but it touches the same runner startup region and should not run in parallel.
- Phase 04 is last because invariant fixtures must assert the final contract across board, projection, and e2e paths.

## Parallel Execution Plan
| Wave | Phases | Eligibility | Blockers / Notes |
|------|--------|-------------|------------------|
| sequential | 01, 02, 03, 04 | sequential | All phases modify shared runner/state/invariant files and must preserve a single transition contract. |

## Source Traceability Matrix
| Req ID | AC ID | Source | Requirement Summary | Phase | Plan File | Status |
|--------|-------|--------|---------------------|-------|-----------|--------|
| REQ-1.1 | AC-01 | Review P1 | Actual runner terminal blocked path writes `STATE.md` through the same pending/commit transition used by publisher. | 01 | `01-terminal-blocked-board-publish-wiring-v1.md` | mapped |
| REQ-1.2 | AC-02 | Review P1 | Production runner path invokes or shares `publishTerminalBlockedOutcome(...)` behavior; no test-only terminal publisher. | 01 | `01-terminal-blocked-board-publish-wiring-v1.md` | mapped |
| REQ-2.1 | AC-03 | Review P1 | Terminal publisher preserves canonical execution sidecar evidence and mirrors the reconciliation guard inputs into `runRoot` deterministically. | 02 | `02-reconciliation-evidence-path-unification-v1.md` | mapped |
| REQ-2.2 | AC-04 | v5 contract | Same-attempt `blocked -> active` succeeds only with `--resume` and matching machine-checkable reconciliation intent plus evidence. | 02 | `02-reconciliation-evidence-path-unification-v1.md` | mapped |
| REQ-3.1 | AC-05 | Review P2 | Active start must not call `withStateTransition(...)`; it directly writes an active current board with `projectionStatus=committed` and keeps compatibility writes separate. | 03 | `03-active-transition-projection-commit-semantics-v1.md` | mapped |
| REQ-3.2 | AC-06 | v5 contract | Heartbeat/progress mirrors remain outside `withStateTransition(...)` and only preserve terminal state. | 03 | `03-active-transition-projection-commit-semantics-v1.md` | mapped |
| REQ-4.1 | AC-07 | Review P2 | Invariants read `STATE.md` and detect `blocked + running`, `complete + active`, pending transition, and `stateRunId` mismatch. | 04 | `04-board-projection-invariant-coverage-v1.md` | mapped |
| REQ-4.2 | AC-08 | Regression suite | Existing state board, lifecycle, lease, terminal publisher, and e2e tests continue to pass. | 04 | `04-board-projection-invariant-coverage-v1.md` | mapped |

## Acceptance Criteria
| AC ID | Pass Condition | Evidence Target |
|-------|----------------|-----------------|
| AC-01 | `stopBlockedPhase()` or its replacement records `STATE.md status=blocked projectionStatus=committed` after successful terminal sidecar/projection writes. | `node --test .claude/scripts/agent-loop-phase-runner.test.mjs` |
| AC-02 | Static and behavioral tests prove `publishTerminalBlockedOutcome(...)` has a production caller or a shared terminal publish boundary used by runner closeout. | `.claude/scripts/agent-loop-phase-runner.test.mjs`, `.claude/scripts/lib/terminal-blocker-publisher.test.mjs` |
| AC-03 | Publisher mirrors `BLOCKER_EVIDENCE.jsonl` and `projection-manifest.json` into `.claude/logs/workflow-enforcement/runs/<stateRunId>/`, and runner reconciliation reads those mirrored guard inputs for the same `stateRunId`. | `node --test .claude/scripts/lib/terminal-blocker-publisher.test.mjs .claude/scripts/agent-loop-phase-runner.test.mjs` |
| AC-04 | Same-attempt resume fails without intent and passes with run-scoped intent plus matching manifest/evidence generated through the production publisher path. | `node --test .claude/scripts/agent-loop-phase-runner.test.mjs` |
| AC-05 | Active attempt start removes the no-op `withStateTransition(...)` call and writes `STATE.md status=active projectionStatus=committed` directly, while phase-status/current-run projection writes remain separate heartbeat/progress boundaries. | `node --test .claude/scripts/agent-loop-phase-runner.test.mjs` |
| AC-06 | Lease heartbeat and progress checkpoint tests prove no new pending transition is opened for mirrors. | `node --test .claude/scripts/lib/phase-run-lease-store.test.mjs .claude/scripts/agent-loop-phase-artifacts.test.mjs` |
| AC-07 | Invariant tests fail on board/projection contradictions and pending board state. | `node --test .claude/scripts/lib/harness-state-invariants.test.mjs` |
| AC-08 | Full focused regression matrix passes and `git diff --check` is clean. | commands listed below |

## Unmapped Source Requirements
- None.

## Validation Command Set
```powershell
node --test .claude/scripts/lib/simple-run-state.test.mjs
node --test .claude/scripts/agent-loop-phase-runner.test.mjs
node --test .claude/scripts/lib/terminal-blocker-publisher.test.mjs
node --test .claude/scripts/lib/lifecycle-projection-writer.test.mjs
node --test .claude/scripts/lib/phase-run-lease-store.test.mjs
node --test .claude/scripts/agent-loop-phase-artifacts.test.mjs
node --test .claude/scripts/lib/harness-state-invariants.test.mjs
node --test .claude/scripts/blocker-closeout-prevention.e2e.test.mjs
git diff --check
```

## Phase Completion Checklist
- [x] Phase 01 - Terminal Blocked Board Publish Wiring (`01-terminal-blocked-board-publish-wiring-v1.md`)
- [x] Phase 02 - Reconciliation Evidence Path Unification (`02-reconciliation-evidence-path-unification-v1.md`)
- [x] Phase 03 - Active Transition Projection Commit Semantics (`03-active-transition-projection-commit-semantics-v1.md`)
- [x] Phase 04 - Board Projection Invariant Coverage (`04-board-projection-invariant-coverage-v1.md`)

## Runnable Preparation Gate
- Do not run `moonshot-phase-runner` from this package until review loop artifacts exist and report `decision: pass`.
- Before dispatch, run:
  ```powershell
  node .claude/scripts/prepare-implementation-plan-state.mjs --plan-dir docs/implementation/phase-runner-state-board-runtime-contract-fixes-2026-05-14 --master-plan docs/implementation/phase-runner-state-board-runtime-contract-fixes-2026-05-14/00-master-plan-v1.md --status-file .claude/docs/phase-status.yaml --execution-root docs/implementation/phase-runner-state-board-runtime-contract-fixes-2026-05-14/execution --dry-run
  ```
- Any stale workflow-enforcement pointer to another active/blocked package is a blocker, not something to reconcile mid-run.

## Completion Rule
- Mark a phase checked only after its phase doc completion criteria and validation commands pass.
- Do not declare full completion until every phase is checked and `AC-01` through `AC-08` have fresh evidence.
