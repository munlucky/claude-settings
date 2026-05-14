# Phase Runner Simple State Board Contract Fixes Master Plan v1

> This package fixes the post-implementation contract gaps found after the `Phase Runner Simple State Board v5` work. It is documentation-only until a later runner preparation step selects it as the active plan package.

## Source Baseline
- User review findings from 2026-05-14 (role: priority source and acceptance contract).
- `docs/implementation/phase-runner-simple-state-board-2026-05-13/00-master-plan-v1.md` (role: original v5 implementation plan).
- `.claude/scripts/lib/simple-run-state.mjs` (role: state board helper and transition guard implementation).
- `.claude/scripts/moonshot-phase-dispatch.mjs` (role: public `--resume` dispatch boundary and run identity initialization).
- `.claude/scripts/agent-loop-phase-runner.mjs` (role: worker spawn guard and active attempt state write path).
- `.claude/scripts/lib/terminal-blocker-publisher.mjs` (role: terminal publish transition precedent).
- `.claude/scripts/lib/phase-run-lease-store.mjs` and `.claude/scripts/lib/lifecycle-projection-writer.mjs` (role: compatibility projection and heartbeat guard precedent).

## Goal Contract Readiness
```yaml
goalContract:
  goalClarity: high
  scopeClarity: high
  acceptanceCriteriaClarity: high
  verificationClarity: high
  clarityScore: 0.929
  ambiguityScore: 0.071
  readinessDecision: pass
  strictRunnableReadiness: false
  isolationNote: "Forked Reviewer Agent review completed in iteration 3 and returned pass with no blocking findings or improvement directives."
  evidence:
    - "The review names exact P1/P2 contract gaps and file-level implementation surfaces."
    - "Existing tests already cover adjacent terminal downgrade, pending-on-failure, and heartbeat preserve behavior, so this package can stay narrowly scoped."
  readinessBlockers:
    - "Do not prepare runner state while another active workstream owns .claude/docs/phase-status.yaml."
    - "Runnable preparation has not been executed in this planning turn."
```

## Objective
- Restore the v5 public contract that `STATE.md` current board is `.claude/logs/workflow-enforcement/STATE.md`.
- Enforce `--resume` board validation at dispatch before dispatch evidence, lease, or projection writes can mutate compatibility files.
- Wire same-attempt `blocked -> active` reconciliation into the actual worker spawn and active attempt transition path.
- Add `paused` as a supported lifecycle state with explicit projection and invariant behavior.

## Non-Goals
- Do not redesign the state model, add SQLite/event sourcing, or move compatibility projections to run-scoped primary storage.
- Do not change the canonical terminal evidence contract; `BLOCKER_EVIDENCE.jsonl`, `ATTEMPT_LEDGER.jsonl`, and `projection-manifest.json` remain authoritative evidence.
- Do not broaden runtime parity, phase execution policy, or worker ownership contracts beyond the findings listed here.
- Do not auto-migrate or delete old `.claude/logs/simple-run-state/<stateRunId>/STATE.md` files during this fix; compatibility read behavior can be added only as a bounded fallback.

## Plan Quality Loop
```yaml
planQualityReview:
  schemaVersion: 1
  finalIteration: 3
  isolationMode: "forked"
  maxIterations: 4
  targetAmbiguityScore: 0.20
  blockedAmbiguityScore: 0.35
  totalScore: 0.929
  ambiguityScore: 0.071
  decision: "pass"
  strictRunnableReadiness: false
  artifactRoot: "docs/implementation/phase-runner-simple-state-board-contract-fixes-2026-05-14/planning-loop"
  latestReview: "docs/implementation/phase-runner-simple-state-board-contract-fixes-2026-05-14/planning-loop/plan-quality-review-iter-03.yaml"
  latestWriterRevision: "docs/implementation/phase-runner-simple-state-board-contract-fixes-2026-05-14/planning-loop/plan-writer-revision-iter-01.yaml"
  blockingFindings: []
  improvementDirectives: []
  readinessNote: "Plan quality passed forked Reviewer Agent review; runnable dispatch still waits on the Runnable Preparation Gate."
```

## Phase Index
| Phase | Title | Plan File | Depends On |
|------|-------|-----------|------------|
| 01 | Current Board Path Unification | `docs/implementation/phase-runner-simple-state-board-contract-fixes-2026-05-14/01-current-board-path-unification-v1.md` | - |
| 02 | Dispatch Resume Board Validation | `docs/implementation/phase-runner-simple-state-board-contract-fixes-2026-05-14/02-dispatch-resume-board-validation-v1.md` | 01 |
| 03 | Reconciliation Resume Runner Wiring | `docs/implementation/phase-runner-simple-state-board-contract-fixes-2026-05-14/03-reconciliation-resume-runner-wiring-v1.md` | 01, 02 |
| 04 | Paused State and Regression Contract | `docs/implementation/phase-runner-simple-state-board-contract-fixes-2026-05-14/04-paused-state-and-regression-contract-v1.md` | 01, 02, 03 |

## Execution Order Notes
- Phase 01 must land first because all later boundaries need the canonical board path and runRoot contract.
- Phase 02 must run before new reconciliation work so dispatch cannot mutate projections before board validation.
- Phase 03 connects helper reconciliation semantics to the actual runner path.
- Phase 04 completes the lifecycle vocabulary and broad regression matrix after the critical P1 gaps are closed.

## Parallel Execution Plan
| Wave | Phases | Eligibility | Blockers / Notes |
|------|--------|-------------|------------------|
| wave-1 | 01 | sequential | Shared helper path semantics affect all phases. |
| wave-2 | 02 | sequential | Shared dispatch startup and evidence ordering. |
| wave-3 | 03 | sequential | Shared runner spawn path and state transition path. |
| wave-4 | 04 | sequential | Shared lifecycle vocabulary and invariant tests. |

## Source Traceability Matrix
| Req ID | AC ID | Source | Requirement Summary | Phase | Plan File | Status |
|--------|-------|--------|---------------------|-------|-----------|--------|
| REQ-1.1 | AC-01 | Finding P1 / board path | Current board is `.claude/logs/workflow-enforcement/STATE.md`; `runRoot` is `.claude/logs/workflow-enforcement/runs/<stateRunId>/`. | 01 | `01-current-board-path-unification-v1.md` | mapped |
| REQ-1.2 | AC-02 | Finding P1 / debug tools | Default `readState` finds the global current board without requiring a run-scoped state path. | 01 | `01-current-board-path-unification-v1.md` | mapped |
| REQ-2.1 | AC-03 | Finding P1 / resume | `--resume` validates `STATE.md` before dispatch writes evidence, leases, or projections. | 02 | `02-dispatch-resume-board-validation-v1.md` | mapped |
| REQ-2.2 | AC-04 | Finding P1 / identity | Dispatch no longer restores `stateRunId` from compatibility projections as the primary source. | 02 | `02-dispatch-resume-board-validation-v1.md` | mapped |
| REQ-3.1 | AC-05 | Finding P1 / reconciliation | Same-attempt `blocked -> active` uses validated run-scoped reconciliation intent in the actual runner path. | 03 | `03-reconciliation-resume-runner-wiring-v1.md` | mapped |
| REQ-3.2 | AC-06 | Finding P1 / active transition | Active attempt start uses `withStateTransition(...)` for meaningful lifecycle state changes, not direct `writeState()`. | 03 | `03-reconciliation-resume-runner-wiring-v1.md` | mapped |
| REQ-4.1 | AC-07 | Finding P2 / paused | `paused` is an allowed lifecycle status with explicit transition and projection rules. | 04 | `04-paused-state-and-regression-contract-v1.md` | mapped |
| REQ-4.2 | AC-08 | Regression closeout | Existing terminal downgrade and stale field scrub tests still pass after the contract fixes. | 04 | `04-paused-state-and-regression-contract-v1.md` | mapped |

## Unmapped Source Requirements
- None.

## Phase Completion Checklist
- [x] Phase 01 - Current Board Path Unification (`docs/implementation/phase-runner-simple-state-board-contract-fixes-2026-05-14/01-current-board-path-unification-v1.md`)
- [x] Phase 02 - Dispatch Resume Board Validation (`docs/implementation/phase-runner-simple-state-board-contract-fixes-2026-05-14/02-dispatch-resume-board-validation-v1.md`)
- [x] Phase 03 - Reconciliation Resume Runner Wiring (`docs/implementation/phase-runner-simple-state-board-contract-fixes-2026-05-14/03-reconciliation-resume-runner-wiring-v1.md`)
- [x] Phase 04 - Paused State and Regression Contract (`docs/implementation/phase-runner-simple-state-board-contract-fixes-2026-05-14/04-paused-state-and-regression-contract-v1.md`)

## Implementation Evidence
- Phase 01: `simple-run-state.mjs` now writes the current board to `.claude/logs/workflow-enforcement/STATE.md` and resolves `runRoot` under `.claude/logs/workflow-enforcement/runs/<stateRunId>`.
- Phase 02: `moonshot-phase-dispatch.mjs` validates the global board before dispatch evidence/lease writes and rejects missing, pending, mismatched, or non-resumed active boards.
- Phase 03: `agent-loop-phase-runner.mjs` routes active start through `withStateTransition(...)` and allows same-attempt blocked resume only with validated reconciliation intent.
- Phase 04: `paused` is an allowed lifecycle state; projection scrub and invariants keep paused projections non-running.
- Review: `docs/implementation/phase-runner-simple-state-board-contract-fixes-2026-05-14/planning-loop/code-review-iter-01.md` records the review disposition and final `APPROVE` verdict.

## Package Verification Commands
- `node --test .claude/scripts/lib/simple-run-state.test.mjs`
- `node --test .claude/scripts/moonshot-phase-dispatch.test.mjs`
- `node --test .claude/scripts/agent-loop-phase-runner.test.mjs`
- `node --test .claude/scripts/lib/terminal-blocker-publisher.test.mjs`
- `node --test .claude/scripts/lib/lifecycle-projection-writer.test.mjs`
- `node --test .claude/scripts/lib/phase-run-lease-store.test.mjs`
- `node --test .claude/scripts/lib/harness-state-invariants.test.mjs`
- `node --test .claude/scripts/blocker-closeout-prevention.e2e.test.mjs`
- `node .claude/scripts/verify-phase-closeout.mjs --help`
- `git diff --check`

## Runnable Preparation Gate
- Run `prepare-implementation-plan-state.mjs --dry-run` before this package becomes the active runner target.
- The dry run must prove root phase docs and master phase references match this package exactly.
- Existing workflow-enforcement projections must be absent, archived, or aligned with this package before dispatch.
- This package has passed isolated plan review, but must not be marked runnable until `prepare-implementation-plan-state.mjs --dry-run` and pointer self-check pass.

## Completion Rule
- The fix is not complete until all P1 findings are covered by failing-before/passing-after tests.
- The P2 paused fix can close only after `paused` appears in helper transition tests and invariant/projection tests.
- A clean closeout must include the full package verification command set and a final `git diff --check`.
