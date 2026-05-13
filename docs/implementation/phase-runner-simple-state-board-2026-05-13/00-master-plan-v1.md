# Phase Runner Simple State Board Master Plan v1

> This package turns the user-provided `Phase Runner Simple State Board Plan v5` into an executable implementation plan. The package is documentation-only until a later `prepare-implementation-plan-state.mjs` run selects it as the active runner target.

## Source Baseline
- User-provided plan: `Phase Runner simple state board implementation plan v5` (role: scope, priority, and technical contract).
- `docs/implementation/phase-runner-simple-controller-refactor-2026-05-13/00-master-plan-v1.md` (role: completed P0 controller baseline; this package is a follow-up, not a replacement).
- `docs/implementation/blocker-closeout-prevention-2026-05-12/00-master-plan-v1.md` (role: terminal blocker sidecar and manifest precedent).
- `docs/implementation/harness-lifecycle-projection-hardening-2026-05-12/00-master-plan-v1.md` (role: lifecycle projection writer and pointer invariant precedent).
- `.claude/scripts/moonshot-phase-dispatch.mjs` (role: public dispatch CLI and delegated-terminal launch surface).
- `.claude/scripts/agent-loop.mjs` (role: phase loop orchestration and child runner invocation surface).
- `.claude/scripts/agent-loop-phase-runner.mjs` (role: worker spawn, retry/remediation, phase state update, and progress checkpoint surface).
- `.claude/scripts/agent-loop-phase-artifacts.mjs` (role: QA/SCORECARD/HANDOFF progress projection writer).
- `.claude/scripts/lib/lifecycle-projection-writer.mjs` (role: compatibility projection write boundary).
- `.claude/scripts/lib/phase-run-lease-store.mjs` (role: active lease heartbeat and current-run mirror writer).
- `.claude/scripts/lib/terminal-blocker-publisher.mjs` (role: canonical terminal blocked sidecar/projection publisher).
- `.claude/scripts/lib/harness-state-invariants.mjs` (role: cross-file state consistency checker).
- `.claude/docs/phase-status.yaml` was inventoried and currently points to `docs/implementation/code-review-graph-forced-use-2026-05-13`; this package must not rewrite active pointers during planning.

## Goal Contract Readiness
```yaml
goalContract:
  goalClarity: high
  scopeClarity: high
  acceptanceCriteriaClarity: high
  verificationClarity: high
  clarityScore: 0.90
  ambiguityScore: 0.10
  readinessDecision: pass
  strictRunnableReadiness: false
  evidence:
    - "The v5 plan fixes --resume semantics, stateRunId mismatch handling, pending/committed transition state, reconciliation intent namespace, and central write boundaries."
    - "The repository already contains the named runner, projection, lease, terminal blocker, invariant, and e2e test surfaces."
  readinessBlockers:
    - "Runnable dispatch is gated until the current code-review-graph-forced-use active pointer is intentionally closed, archived, or superseded."
    - "A dry-run pointer self-check is mandatory before prepare-implementation-plan-state.mjs writes runnable state for this package."
```

## Objective
- Add `STATE.md` as a current run board and transition guard input, not as canonical closeout evidence.
- Keep canonical terminal evidence in `BLOCKER_EVIDENCE.jsonl`, `ATTEMPT_LEDGER.jsonl`, and `projection-manifest.json`.
- Add a single `withStateTransition(...)` helper so meaningful lifecycle transitions cannot leave `STATE.md` committed without all compatibility projections.
- Add `stateRunId` isolation so a new phase-runner dispatch cannot overwrite another active or blocked run's global projection files.
- Add a public `--resume` option and make it the only resume intent accepted by dispatch, agent-loop, and phase-runner.
- Prevent `blocked + running`, `active + finalVerdict=complete`, same-attempt remediation after `scorecard-verdict=blocked`, and `STATE.md`-only partial writes.

## Non-Goals
- Do not convert run-scoped compatibility files into the primary storage in this first implementation.
- Do not replace sidecar/manifest terminal evidence with `STATE.md`.
- Do not introduce SQLite schema changes, full event sourcing, dashboard/TUI work, or global artifact regeneration.
- Do not infer resume from `PHASE_RUN_LEASE_ID`, existing lease files, env variables, or file presence.
- Do not let heartbeat/progress mirror open `STATE.md` pending/commit transitions.
- Do not move or rewrite the currently active `code-review-graph-forced-use-2026-05-13` phase-status pointer during planning.

## Plan Quality Loop
```yaml
planQualityReview:
  schemaVersion: 1
  finalIteration: 2
  isolationMode: "forked"
  maxIterations: 4
  targetAmbiguityScore: 0.20
  blockedAmbiguityScore: 0.35
  totalScore: 0.932
  ambiguityScore: 0.068
  decision: "pass"
  strictRunnableReadiness: false
  artifactRoot: "docs/implementation/phase-runner-simple-state-board-2026-05-13/planning-loop"
  latestReview: "docs/implementation/phase-runner-simple-state-board-2026-05-13/planning-loop/plan-quality-review-iter-02.yaml"
  latestWriterRevision: "docs/implementation/phase-runner-simple-state-board-2026-05-13/planning-loop/plan-writer-revision-iter-01.yaml"
  blockingFindings: []
  improvementDirectives: []
  readinessNote: "Planning package passed isolated review; runnable dispatch still waits on the Runnable Preparation Gate."
```

## Phase Index
| Phase | Title | Plan File | Depends On |
|------|-------|-----------|------------|
| 01 | Simple Run State Helper | `docs/implementation/phase-runner-simple-state-board-2026-05-13/01-simple-run-state-helper-v1.md` | - |
| 02 | Resume CLI and Run Identity Guard | `docs/implementation/phase-runner-simple-state-board-2026-05-13/02-resume-cli-run-identity-guard-v1.md` | 01 |
| 03 | Projection Scrub and Lease Heartbeat Guard | `docs/implementation/phase-runner-simple-state-board-2026-05-13/03-projection-scrub-lease-heartbeat-guard-v1.md` | 01, 02 |
| 04 | Terminal Publisher and Reconciliation Intent | `docs/implementation/phase-runner-simple-state-board-2026-05-13/04-terminal-publisher-reconciliation-intent-v1.md` | 01, 03 |
| 05 | Runner Spawn Guard, Artifacts, and E2E Invariants | `docs/implementation/phase-runner-simple-state-board-2026-05-13/05-runner-spawn-artifacts-e2e-invariants-v1.md` | 01, 02, 03, 04 |

## Execution Order Notes
- Phase 01 creates the only `STATE.md` parser/writer and transition API; later phases must not implement ad hoc parsing.
- Phase 02 adds the public resume contract and run identity rejection before compatibility projections can be overwritten.
- Phase 03 routes existing compatibility writers through target-aware scrub and terminal preserve behavior.
- Phase 04 wraps terminal blocked publication in one `withStateTransition(...)` unit and adds machine-checkable reconciliation intent.
- Phase 05 applies the hard guard at worker spawn and closes the regression matrix across artifacts and e2e fixtures.

## Parallel Execution Plan
| Wave | Phases | Eligibility | Blockers / Notes |
|------|--------|-------------|------------------|
| wave-1 | 01 | sequential | Foundation helper and tests define the contract used by all other phases. |
| wave-2 | 02 | sequential | Touches public CLI parsing and dispatch propagation across shared runners. |
| wave-3 | 03 | sequential | Touches shared projection and heartbeat writers. |
| wave-4 | 04 | sequential | Touches terminal blocker canonical publish path and reconciliation semantics. |
| wave-5 | 05 | sequential | Touches worker spawn control, artifacts, invariants, and e2e regression. |

## Source Traceability Matrix
| Req ID | AC ID | Source | Requirement Summary | Phase | Plan File | Status |
|--------|-------|--------|---------------------|-------|-----------|--------|
| REQ-1.1 | AC-01 | v5 / State board | Add `.claude/scripts/lib/simple-run-state.mjs` with `readState`, `withStateTransition`, `assertCanTransition`, and `scrubCompatibilityProjection`. | 01 | `01-simple-run-state-helper-v1.md` | mapped |
| REQ-1.2 | AC-02 | v5 / STATE.md header | Parse and write required `STATE.md` headers including `stateRunId`, `transitionId`, `projectionStatus`, and `runRoot`. | 01 | `01-simple-run-state-helper-v1.md` | mapped |
| REQ-1.3 | AC-03 | v5 / pending commit | Keep projection failures pending and make the next execution report `incomplete_transaction`. | 01 | `01-simple-run-state-helper-v1.md` | mapped |
| REQ-2.1 | AC-04 | v5 / --resume | Add `--resume` to dispatch, agent-loop, and phase-runner, and propagate it downward. | 02 | `02-resume-cli-run-identity-guard-v1.md` | mapped |
| REQ-2.2 | AC-05 | v5 / run identity | Reject global projection overwrite when `stateRunId` mismatches the current board. | 02 | `02-resume-cli-run-identity-guard-v1.md` | mapped |
| REQ-2.3 | AC-05A | v5 / explicit resume only | Prove `PHASE_RUN_LEASE_ID`, existing lease files, env values, and reconciliation file presence are not accepted as resume intent without `--resume`. | 02 | `02-resume-cli-run-identity-guard-v1.md` | mapped |
| REQ-3.1 | AC-06 | v5 / target-aware scrub | Add target-aware compatibility scrub without putting lifecycle event strings into `latest-dispatch.status`. | 03 | `03-projection-scrub-lease-heartbeat-guard-v1.md` | mapped |
| REQ-3.2 | AC-07 | v5 / heartbeat preserve | Prevent active heartbeat from downgrading same-attempt terminal projections. | 03 | `03-projection-scrub-lease-heartbeat-guard-v1.md` | mapped |
| REQ-4.1 | AC-08 | v5 / terminal publish | Wrap terminal blocked publish in one transition and commit only after sidecar, manifest, and all projections succeed. | 04 | `04-terminal-publisher-reconciliation-intent-v1.md` | mapped |
| REQ-4.2 | AC-09 | v5 / reconciliation | Allow same-attempt `blocked -> active` only with run-scoped reconciliation intent and matching sidecar/manifest evidence. | 04 | `04-terminal-publisher-reconciliation-intent-v1.md` | mapped |
| REQ-5.1 | AC-10 | v5 / worker spawn guard | Hard reject same-attempt active/running worker spawn after terminal blocked/complete/cancelled state. | 05 | `05-runner-spawn-artifacts-e2e-invariants-v1.md` | mapped |
| REQ-5.2 | AC-11 | v5 / artifact preserve | Ensure progress checkpoint and artifact sync do not turn blocked scorecard/STATE into retry/active. | 05 | `05-runner-spawn-artifacts-e2e-invariants-v1.md` | mapped |
| REQ-5.3 | AC-12 | v5 / invariant and e2e | Add invariant and e2e fixtures for blocked/running, complete/active, pending projection, stateRunId mismatch, and blocked remediation loop prevention. | 05 | `05-runner-spawn-artifacts-e2e-invariants-v1.md` | mapped |

## Unmapped Source Requirements
- None for v5.

## Phase Completion Checklist
- [x] Phase 01 - Simple Run State Helper (`docs/implementation/phase-runner-simple-state-board-2026-05-13/01-simple-run-state-helper-v1.md`)
- [x] Phase 02 - Resume CLI and Run Identity Guard (`docs/implementation/phase-runner-simple-state-board-2026-05-13/02-resume-cli-run-identity-guard-v1.md`)
- [ ] Phase 03 - Projection Scrub and Lease Heartbeat Guard (`docs/implementation/phase-runner-simple-state-board-2026-05-13/03-projection-scrub-lease-heartbeat-guard-v1.md`)
- [ ] Phase 04 - Terminal Publisher and Reconciliation Intent (`docs/implementation/phase-runner-simple-state-board-2026-05-13/04-terminal-publisher-reconciliation-intent-v1.md`)
- [ ] Phase 05 - Runner Spawn Guard, Artifacts, and E2E Invariants (`docs/implementation/phase-runner-simple-state-board-2026-05-13/05-runner-spawn-artifacts-e2e-invariants-v1.md`)

## Package Verification Commands
- `node --test .claude/scripts/lib/simple-run-state.test.mjs`
- `node --test .claude/scripts/moonshot-phase-dispatch.test.mjs`
- `node --test .claude/scripts/lib/phase-run-lease-store.test.mjs`
- `node --test .claude/scripts/lib/harness-state-invariants.test.mjs`
- `node --test .claude/scripts/lib/lifecycle-projection-writer.test.mjs`
- `node --test .claude/scripts/lib/terminal-blocker-publisher.test.mjs`
- `node --test .claude/scripts/agent-loop-phase-artifacts.test.mjs`
- `node --test .claude/scripts/blocker-closeout-prevention.e2e.test.mjs`
- `git diff --check`

## Preparation Notes
- Do not run `prepare-implementation-plan-state.mjs` until the isolated planning loop passes and the current active `code-review-graph-forced-use-2026-05-13` pointer is intentionally closed, archived, or superseded.
- A later preparation step must run `prepare-implementation-plan-state.mjs --dry-run` first because active runtime pointers currently belong to another workstream.

## Runnable Preparation Gate
- `prepare-implementation-plan-state.mjs` must not run for this package until the current `code-review-graph-forced-use-2026-05-13` active pointer is intentionally closed, archived, or superseded.
- Dry-run pointer self-check is mandatory before any runnable preparation writes; any mismatch between the selected master plan, root phase docs, execution root, and existing runtime projections is a preparation failure.

## Completion Rule
- `STATE.md` is a board and guard input only.
- `projectionStatus=pending` is not recoverable by automatic resume.
- A phase can be checked only after its phase commands pass and evidence is recorded in the corresponding execution QA artifacts.
