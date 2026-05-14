# Phase Runner State Board Closeout Remediation

## Source Baseline

This package is based on the 2026-05-14 review findings for the range beginning at `f56a4f7fc12476fec685af87a6122ddd7449e874` and the live post-run evidence from the `fbb03d6` phase runner closeout.

Selected sources:

| Source ID | Role | Evidence |
| --- | --- | --- |
| REQ-1 | Primary review finding | Clean completion leaves `.claude/logs/workflow-enforcement/STATE.md` with `status: active` while `current-run.json` has `finalVerdict: complete`. |
| REQ-2 | Primary review finding | `harness-state-invariants.mjs` misses `active board + completed projection`. |
| REQ-3 | Range hygiene finding | `.codex/agents/verification/code_review_graph_evidence_test.py` points fixture lookup at `.codex/scripts/lib/...`, while fixtures live under `.claude/scripts/lib/...`. |
| REQ-4 | Range hygiene finding | `git diff --check f56a4f7fc12476fec685af87a6122ddd7449e874..HEAD` reports a blank line at EOF in `.codex/agents/verification/code_review_graph_evidence.py`. |
| REQ-5 | Startup contract finding | `projectionStatus: pending` with `status: complete` is not classified as `incomplete_transaction` on startup. |
| REQ-6 | Runtime constraint | Native `code-review-graph` MCP is `Transport closed` in this Codex session; CLI evidence is the usable path until app/session restart. |

## Goal Contract

goalClarity: high
scopeClarity: high
acceptanceCriteriaClarity: high
verificationClarity: high
clarityScore: 0.90
ambiguityScore: 0.09
readinessDecision: review_passed_ready_for_runnable_preparation

The implementation goal is to restore the simple run board contract so terminal projections cannot coexist with a stale active board, then close the review-range verification failures that block a clean `f56a4f7..HEAD` verdict.

## Non-Goals

- No new state database, event-sourcing layer, or broad lifecycle rewrite.
- No replacement of `STATE.md` as a small board and transition guard input.
- No change to MemoryGraph or code-review-graph MCP registration in this package.
- No runnable phase-state preparation until the independent planning loop is approved and completed.

## Acceptance Criteria

| AC ID | Source | Requirement | Evidence Target |
| --- | --- | --- | --- |
| AC-1 | REQ-1 | Clean completion writes a terminal `STATE.md` transition with `status: complete` for the same `stateRunId`. | `node --test .claude/scripts/agent-loop-phase-runner.test.mjs` plus `STATE.md` fixture assertion. |
| AC-2 | REQ-1 | Completion transition happens only after all blocking closeout substeps succeed. Blocking substeps are closeout finalizer and required QA/HANDOFF artifact publication; commit prompt generation is advisory and must not roll back a completed board. | Focused finalizer failure, QA/HANDOFF failure, and commit prompt failure regression tests. |
| AC-3 | REQ-2 | Invariants fail when board is `active` and the matching projection is terminal or `finalVerdict: complete`. | `node --test .claude/scripts/lib/harness-state-invariants.test.mjs`. |
| AC-4 | REQ-2 | Existing blocked/complete projection invariant behavior remains intact. | Existing invariant test suite stays green. |
| AC-5 | REQ-5 | Startup classifies `projectionStatus: pending` plus terminal board/projection mismatch as `incomplete_transaction`, not `clean_start`. | `node --test .claude/scripts/agent-loop-phase-runner.test.mjs`. |
| AC-6 | REQ-3 | CRG Python evidence tests resolve shared fixtures from `.claude/scripts/lib/code-review-graph-fixtures`. | `python .codex/agents/verification/code_review_graph_evidence_test.py`. |
| AC-7 | REQ-4 | Review-range diff hygiene passes for `f56a4f7..HEAD`. | `git diff --check f56a4f7fc12476fec685af87a6122ddd7449e874..HEAD`. |
| AC-8 | REQ-6 | CRG review evidence uses CLI fallback when native MCP transport is closed. Phase 04 does not implement or prove MCP unavailable-cache behavior. | QA evidence records `code-review-graph detect-changes --repo . --base f56a4f7... --brief` output. |

## Phase Index

| Phase | File | Purpose | Dependency | Parallel |
| --- | --- | --- | --- | --- |
| 01 | `01-clean-completion-board-terminal-transition-v1.md` | Write complete board transition on clean finish and protect failed finalizer paths. | None | No |
| 02 | `02-state-board-terminal-projection-invariants-v1.md` | Add invariant coverage for active board with terminal projection. | Phase 01 | No |
| 03 | `03-startup-pending-projection-classification-v1.md` | Close startup classification gap for pending projection and terminal board combinations. | Phase 02 | No |
| 04 | `04-review-range-crg-and-diff-hygiene-v1.md` | Fix CRG Python fixture root and range diff hygiene. | None | Yes |

## Parallel Execution Plan

Wave 1 is sequential: Phase 01 and Phase 02 both touch the run board/projection contract and must be reviewed in order.

Wave 2 can run after Phase 02: Phase 03 extends startup classification on the same runner surface, so it should not run in parallel with Phase 01 or Phase 02.

Sidecar Wave A can run independently: Phase 04 touches `.codex/agents/verification/*` and does not overlap with the runner state files. It may run in parallel with Phase 01 if the worker owns only `.codex/agents/verification` and does not modify `.claude/scripts`.

## Source Traceability

| Req ID | AC ID | Requirement Summary | Phase | Plan File | Status |
| --- | --- | --- | --- | --- | --- |
| REQ-1 | AC-1, AC-2 | Clean completion must close `STATE.md` to terminal complete. | 01 | `01-clean-completion-board-terminal-transition-v1.md` | planned |
| REQ-2 | AC-3, AC-4 | Invariant must catch active board plus terminal projection. | 02 | `02-state-board-terminal-projection-invariants-v1.md` | planned |
| REQ-5 | AC-5 | Pending projection startup must stop as incomplete transaction. | 03 | `03-startup-pending-projection-classification-v1.md` | planned |
| REQ-3 | AC-6 | CRG Python fixture root must point at shared fixtures. | 04 | `04-review-range-crg-and-diff-hygiene-v1.md` | planned |
| REQ-4 | AC-7 | Range diff hygiene must pass. | 04 | `04-review-range-crg-and-diff-hygiene-v1.md` | planned |
| REQ-6 | AC-8 | CRG MCP stale transport must be handled by CLI fallback evidence in this range review. | 04 | `04-review-range-crg-and-diff-hygiene-v1.md` | planned |

## Phase Completion Checklist

- [x] Phase 01 - Clean Completion Board Terminal Transition (`01-clean-completion-board-terminal-transition-v1.md`)
- [x] Phase 02 - State Board Terminal Projection Invariants (`02-state-board-terminal-projection-invariants-v1.md`)
- [ ] Phase 03 - Startup Pending Projection Classification (`03-startup-pending-projection-classification-v1.md`)
- [ ] Phase 04 - Review Range CRG and Diff Hygiene (`04-review-range-crg-and-diff-hygiene-v1.md`)

## Runnable Preparation Gate

Do not run `prepare-implementation-plan-state.mjs` for this package until it is explicitly selected as the next execution target.

Current `.claude/docs/phase-status.yaml` points at `docs/implementation/phase-runner-reconciliation-resolved-evidence-guard-2026-05-14/00-master-plan-v1.md` and records final git closeout state. This package is documentation-only until explicitly selected.

Before runnable preparation:

1. Confirm this package is intentionally selected over the current `.claude/docs/phase-status.yaml` pointer.
2. Confirm no blocking plan review findings remain.
3. Run `prepare-implementation-plan-state.mjs --dry-run` and verify phase inventory matches this package only.
4. Ensure `STATE.md`, `current-run.json`, `active-phase-run.json`, and `latest-dispatch.json` are either archived or point to this selected package.

## Plan Quality Loop

Status: independent planning loop completed.

Reviewer iteration 1 returned `decision: revise`, `ambiguityScore: 0.15`, with two P1 directives: completion transition ordering and AC-8 scope/evidence.

Writer iteration 1 applied all reviewer directives:

- `finalizeCompletion()` terminal board transition is ordered after closeout finalizer and required QA/HANDOFF publication.
- Commit prompt failure is advisory and must not roll back a completed board.
- AC-8 is narrowed to CRG CLI fallback evidence only.
- Phase 02 terminal projection checks use concrete persisted field combinations.
- Phase 03 startup classification names exact helper boundaries and expected non-resume/resume outputs.

Reviewer iteration 2 returned `decision: conditional_pass`, `ambiguityScore: 0.09`, and no blocking findings. The remaining QA/HANDOFF function-name note is classified as an implementation lookup note, not a planning blocker.

Current controller decision: `review_passed_ready_for_runnable_preparation`.

## Verification Plan

Minimum closeout commands after implementation:

```powershell
node --test .claude/scripts/agent-loop-phase-runner.test.mjs
node --test .claude/scripts/lib/harness-state-invariants.test.mjs
node --test .claude/scripts/lib/simple-run-state.test.mjs
python .codex/agents/verification/code_review_graph_evidence_test.py
git diff --check
git diff --check f56a4f7fc12476fec685af87a6122ddd7449e874..HEAD
code-review-graph detect-changes --repo . --base f56a4f7fc12476fec685af87a6122ddd7449e874 --brief
```

If native MCP still returns `Transport closed`, record that as non-blocking runtime unavailability and use the CLI evidence above. Do not add unavailable-cache implementation to Phase 04; that belongs to a separate runner or adapter change package.
