# Phase Runner Simple Controller Refactor Master Plan v1

> This package converts the user-provided `Phase Runner Simple Controller Refactor Plan v13` into an executable P0 implementation plan. It preserves the existing phase structure and public entrypoints while moving loop retry decisions into a small controller decision contract.

## Source Baseline
- User-provided plan: `Phase Runner Simple Controller Refactor Plan v13` (role: scope, priority, and technical contract).
- `.claude/scripts/agent-loop-phase-runner.mjs` (role: current review/verify/finish/checkpoint branching surface and worker prompt construction).
- `.claude/scripts/phase-closeout-finalize.mjs` (role: finalizer owner for completed state promotion).
- `.claude/scripts/verify-phase-closeout.mjs` and `.claude/scripts/verify-phase-closeout.test.mjs` (role: closeout verifier and final completion guard).
- `.claude/scripts/verify-plan-conformance.mjs` and `.claude/scripts/verify-plan-conformance.test.mjs` (role: source/evidence freshness and conformance guard).
- `.claude/scripts/harness-state-invariants.test.mjs` (role: state invariant regression guard).
- Existing plan packages under `docs/implementation/*` (role: brownfield planning patterns and evidence boundaries).

## Goal Contract Readiness
```yaml
goalContract:
  goalClarity: high
  scopeClarity: high
  acceptanceCriteriaClarity: high
  verificationClarity: high
  clarityScore: 0.84
  ambiguityScore: 0.16
  readinessDecision: constrained/pending-isolated-review
  strictRunnableReadiness: false
  evidence:
    - "User v13 plan defines controller decisions, I/O, finalizer adapter, remediation packet, test plan, and acceptance criteria."
    - "Current repository contains the named runner, finalizer, verifier, conformance, and invariant test surfaces."
  readinessBlockers:
    - "Isolated Reviewer/Writer planning loop was not run because this turn did not explicitly authorize sub-agent delegation."
```

## Objective
- Keep the phase runner public entrypoints and phase structure stable.
- Add a pure `phase-loop-controller.mjs` that accepts normalized signals only and never reads raw Markdown.
- Start integration in shadow mode, log mismatches, then move review/verify/finish/checkpoint failure handling to the controller decision.
- Treat `clean_finish_candidate` only as permission to call the existing finalizer/verifier closeout path, never as completion.
- Create and consume fresh `remediation-request.json` packets for controller-enforced failure retries.

## Non-Goals
- Do not replace `phase-closeout-finalize.mjs` as the completion owner.
- Do not let remediation packets satisfy completion evidence.
- Do not rewrite the public `agent-loop-phase-runner.mjs` CLI contract.
- Do not implement P1 closeout hardening items in this P0 package.
- Do not implement P2 parallel/state reconstruction hardening items in this P0 package.
- Do not treat Markdown artifacts as canonical controller input.

## Plan Quality Loop
```yaml
planQualityReview:
  schemaVersion: 1
  finalIteration: 1
  isolationMode: "unavailable"
  maxIterations: 4
  targetAmbiguityScore: 0.20
  blockedAmbiguityScore: 0.35
  totalScore: 0.84
  ambiguityScore: 0.16
  decision: "constrained"
  strictRunnableReadiness: false
  artifactRoot: "docs/implementation/phase-runner-simple-controller-refactor-2026-05-13/planning-loop"
  latestReview: "docs/implementation/phase-runner-simple-controller-refactor-2026-05-13/planning-loop/plan-quality-review-iter-01.yaml"
  latestWriterRevision: "docs/implementation/phase-runner-simple-controller-refactor-2026-05-13/planning-loop/plan-writer-revision-iter-01.yaml"
  remainingImprovementDirectives:
    - "Run an isolated Reviewer Agent before strict runnable dispatch if strict plan-writer readiness is required."
```

## Phase Index
| Phase | Title | Plan File | Depends On |
|------|-------|-----------|------------|
| 01 | Controller Contract Pure Function | `docs/implementation/phase-runner-simple-controller-refactor-2026-05-13/01-controller-contract-pure-function-v1.md` | - |
| 02 | Shadow Signal Adapter | `docs/implementation/phase-runner-simple-controller-refactor-2026-05-13/02-shadow-signal-adapter-v1.md` | 01 |
| 03 | Controller Enforcement and Finalizer Gate | `docs/implementation/phase-runner-simple-controller-refactor-2026-05-13/03-controller-enforcement-finalizer-gate-v1.md` | 01, 02 |
| 04 | Remediation Packet and Worker Prompt | `docs/implementation/phase-runner-simple-controller-refactor-2026-05-13/04-remediation-packet-worker-prompt-v1.md` | 01, 02, 03 |

## Execution Order Notes
- Phase 01 lands first because all later work imports the pure decision contract.
- Phase 02 must stay behavior-preserving; it records shadow mismatches without changing runner outcomes.
- Phase 03 is the behavioral switch and must keep completed state writes behind finalizer/verifier pass.
- Phase 04 depends on controller-enforced failure paths so remediation packets are created only from normalized controller output.

## Parallel Execution Plan
| Wave | Phases | Eligibility | Blockers / Notes |
|------|--------|-------------|------------------|
| wave-1 | 01 | sequential | Establishes controller decision vocabulary and output schema. |
| wave-2 | 02 | sequential | Touches shared runner branching surface; keep isolated from enforcement. |
| wave-3 | 03 | sequential | Changes failure handling behavior and finalizer invocation gate. |
| wave-4 | 04 | sequential | Extends retry prompt construction and source hash handling after enforcement exists. |

## Source Traceability Matrix
| Req ID | AC ID | Source | Requirement Summary | Phase | Plan File | Status |
|--------|-------|--------|---------------------|-------|-----------|--------|
| REQ-1.1 | AC-01 | v13 / Controller pure function | Add `.claude/scripts/lib/phase-loop-controller.mjs` as a pure function with six decisions. | 01 | `01-controller-contract-pure-function-v1.md` | mapped |
| REQ-1.2 | AC-02 | v13 / Controller I/O | Return fixed schema including `attemptNumber`, `sourceDecisionId`, `retryRecommended`, and `nextAttemptInput`. | 01 | `01-controller-contract-pure-function-v1.md` | mapped |
| REQ-1.3 | AC-03 | v13 / Decision mapping | Map review/verify/finish/checkpoint cases to `continue_execute`, `rerun_review`, `rerun_verify`, `repair_required`, `blocked`, or `clean_finish_candidate`. | 01 | `01-controller-contract-pure-function-v1.md` | mapped |
| REQ-2.1 | AC-04 | v13 / Shadow adapter | Add normalized signal adapter in `agent-loop-phase-runner.mjs`; controller reads normalized signal only. | 02 | `02-shadow-signal-adapter-v1.md` | mapped |
| REQ-2.2 | AC-05 | v13 / Shadow mode | Log mismatch between legacy runner branch and controller decision without behavior change. | 02 | `02-shadow-signal-adapter-v1.md` | mapped |
| REQ-3.1 | AC-06 | v13 / Enforcement | Replace review/verify/finish/checkpoint failure decisions with controller decision after shadow mode. | 03 | `03-controller-enforcement-finalizer-gate-v1.md` | mapped |
| REQ-3.2 | AC-07 | v13 / Finalizer boundary | Call finalizer only on `clean_finish_candidate`; completed state write remains gated by finalizer/verifier pass. | 03 | `03-controller-enforcement-finalizer-gate-v1.md` | mapped |
| REQ-4.1 | AC-08 | v13 / Finalizer failure adapter | Map known finalizer failure codes to normalized finish signals; unknown maps to blocked without retry. | 03 | `03-controller-enforcement-finalizer-gate-v1.md` | mapped |
| REQ-5.1 | AC-09 | v13 / Remediation packet | Create `<phase-execution-dir>/remediation-request.json` from controller output plus source hash metadata. | 04 | `04-remediation-packet-worker-prompt-v1.md` | mapped |
| REQ-5.2 | AC-10 | v13 / Prompt injection | Inject fresh failed cases and improvement directives into next worker attempt prompt. | 04 | `04-remediation-packet-worker-prompt-v1.md` | mapped |
| REQ-5.3 | AC-11 | v13 / Freshness | Ignore stale or superseded packets and never treat remediation as completion evidence. | 04 | `04-remediation-packet-worker-prompt-v1.md` | mapped |

## Unmapped Source Requirements
- None for P0.
- P1 and P2 items are intentionally deferred to the follow-up backlog below.

## Deferred Backlog
| Backlog | Items | Reason Deferred |
|---------|-------|-----------------|
| P1 Closeout Hardening | Two-phase finalizer gate, structured conformance artifact, minimal projection transaction, atomic machine projection publish, repair identity split, explicit repair CLI, checkpoint scope selector, `git add .` ban, self-modification guard, terminal pointer migration. | Requires a stable controller decision path first. |
| P2 Parallel and State Hardening | Wave partial-success, failed-phase-only requeue, append-only `PHASE_LOOP_EVENTS.jsonl`, replay cache reconstruction, projection transaction cross-check, legacy `activePhaseNumber` hard fail, blocker fingerprint dedupe and requeue policy. | Depends on P0/P1 state event boundaries. |

## Phase Completion Checklist
- [x] Phase 01 - Controller Contract Pure Function (`docs/implementation/phase-runner-simple-controller-refactor-2026-05-13/01-controller-contract-pure-function-v1.md`)
- [x] Phase 02 - Shadow Signal Adapter (`docs/implementation/phase-runner-simple-controller-refactor-2026-05-13/02-shadow-signal-adapter-v1.md`)
- [x] Phase 03 - Controller Enforcement and Finalizer Gate (`docs/implementation/phase-runner-simple-controller-refactor-2026-05-13/03-controller-enforcement-finalizer-gate-v1.md`)
- [x] Phase 04 - Remediation Packet and Worker Prompt (`docs/implementation/phase-runner-simple-controller-refactor-2026-05-13/04-remediation-packet-worker-prompt-v1.md`)

## Package Verification Commands
- `node --test .claude/scripts/agent-loop-phase-state.test.mjs`
- `node --test .claude/scripts/verify-phase-closeout.test.mjs`
- `node --test .claude/scripts/phase-closeout-finalize.test.mjs`
- `node --test .claude/scripts/verify-plan-conformance.test.mjs`
- `node --test .claude/scripts/harness-state-invariants.test.mjs`
- `bash .claude/scripts/verify-phase-runner-boundary.sh`
- `node .claude/scripts/verify-code-policy.mjs`
- `node .claude/scripts/verify-shell-syntax.mjs`

## Completion Rule
- `clean_finish_candidate` is not completion.
- The controller may recommend retry input, but it may not bypass lease, runner, finalizer, verifier, or checkpoint policy.
- A phase can be checked only after its phase tests and the package verification commands relevant to its owned paths pass.
