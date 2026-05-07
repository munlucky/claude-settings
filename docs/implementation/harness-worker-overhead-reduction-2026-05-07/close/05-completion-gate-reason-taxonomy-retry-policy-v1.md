# Phase 05: Completion Gate Reason Taxonomy And Retry Policy (v1)

## Source Mapping

| Req ID | Source Section | Requirement Summary | This Phase Handling |
|---|---|---|---|
| HWO-001 | User overhead item 1 | Attempt churn comes from treating code attempts and closeout bookkeeping attempts equally | Normalize gate reasons and route closeout-only gaps to writer-only remediation |
| HWO-009 | User overhead item 9 | Artifact bookkeeping must not be a broad worker responsibility | Prefer structured verdict/score/closeout payloads over markdown-only heuristics |
| HWO-012 | Prior NWFP-009/NWFP-010 | repeated same environment failure suppresses retry | Map every gate reason to an explicit retry policy |

## Goal

- Make completion gate failure reasons decision-complete so the runner chooses writer-only remediation, verification remediation, stop-loop, or controlled fallback without guesswork.

## Expected Outcome

- Gate reasons are normalized to a small taxonomy: `verification_missing`, `review_closeout_missing`, `finish_closeout_missing`, `environment_blocked`, `artifact_contract_invalid`, `score_incomplete`, and `ok`.
- Review/finish closeout-only gaps do not launch broad implementation workers when fresh structured verification exists.
- Real verification missing/failing still blocks or performs limited verification remediation.

## Phase Execution Metadata

```yaml
phaseExecution:
  schemaVersion: 1
  parallelEligible: false
  parallelGroup: "wave-4"
  dependsOn:
    - "01"
    - "02"
    - "04"
  conflictsWith:
    - "03"
    - "06"
  ownedPaths:
    - ".claude/scripts/agent-loop-phase-state.mjs"
    - ".claude/scripts/agent-loop-phase-attempt.mjs"
    - ".claude/scripts/agent-loop-phase-runner.mjs"
  readOnlyPaths:
    - ".claude/scripts/agent-loop-phase-artifacts.mjs"
    - ".claude/scripts/lib/failure-classifier.mjs"
    - ".claude/verification.contract.yaml"
  sharedMutablePaths: []
  requiresManualEvidence: false
  mergePolicy: "sequential_shared_harness"
```

## Scope

- In scope:
  - Add a gate reason normalization layer with explicit retry policy.
  - Map existing raw reasons to normalized categories without losing detail.
  - Route `review_closeout_missing` and `finish_closeout_missing` to Phase 04 writer-only remediation when fresh passed verdict exists.
  - Stop immediately for no-retry environment blockers.
  - Cap verification remediation attempts for missing verification evidence.
- Out of scope:
  - Lowering target score.
  - Marking phases complete with stale or failed verification evidence.
  - Removing markdown checks before structured replacements exist.

## Preconditions And Inputs

- Phases 01, 02, and 04 are merged.
- Required current code:
  - `.claude/scripts/agent-loop-phase-state.mjs`
  - `.claude/scripts/agent-loop-phase-attempt.mjs`
  - `.claude/scripts/agent-loop-phase-runner.mjs`

## Detailed Tasks

| ID | Task | Steps | Done Criteria |
|---|---|---|---|
| P05-1 | Define gate reason taxonomy | Add normalized category and detail fields for existing gate outcomes | Every known gate reason maps to one category |
| P05-2 | Define retry policy table | Map categories to writer-only, verification-remediation, stop-loop, or limited retry | Runner no longer infers policy from prose strings |
| P05-3 | Integrate writer-only route | Use Phase 04 writer for review/finish closeout-only gaps with fresh verdict | No new implementation worker launches for closeout-only gaps |
| P05-4 | Add regression fixtures | Cover missing verification, review gap, finish gap, environment block, real score incomplete | Tests prove correct route per category |

## Critical Product Scenarios

| ID | User-Visible Expectation | Verification Command | Expected Signal | Evidence Path |
|---|---|---|---|---|
| SCN-P05-1 | Fresh verdict plus missing review closeout triggers writer-only remediation | targeted gate/runner fixture | Route is writer-only, not implementation worker | `QA_REPORT.md` fixture output |
| SCN-P05-2 | Real missing verification does not get papered over by closeout writer | targeted gate fixture | Route is verification remediation or blocked, not clean finish | `QA_REPORT.md` fixture output |
| SCN-P05-3 | Environment blocker stops without broad auto-fix | `node .claude/scripts/agent-loop-phase-attempt.mjs decide-missing-evidence-action 1 3 true false mcp_cleanup_eperm` | `ACTION='stop-loop'` | `QA_REPORT.md` command output |

## Exact Execution Targets

| ID | Files To Create | Files To Modify | Files To Test | Commands | Expected Fail/Pass Signals |
|---|---|---|---|---|---|
| P05-1 | none | `.claude/scripts/agent-loop-phase-state.mjs` | self-test or new fixture | `node .claude/scripts/agent-loop-phase-state.mjs self-test` | Exit 0 with normalized categories |
| P05-2 | none | `.claude/scripts/agent-loop-phase-attempt.mjs` | attempt decision fixture | `node .claude/scripts/agent-loop-phase-attempt.mjs classify-gate-stop-reason review-incomplete` | Stable category/stage output |
| P05-3 | none | `.claude/scripts/agent-loop-phase-runner.mjs` | runner dry fixture if added | `node --check .claude/scripts/agent-loop-phase-runner.mjs` | Exit 0; writer-only branch retained |
| P05-4 | none | test/self-test sections | same | `node --test .claude/scripts/verify-phase-closeout.test.mjs` | Strict closeout behavior preserved |

## Blockers And Review

- Blocker condition: A code/test failure gets normalized as closeout-only and bypasses verification.
- First review checkpoint: Review category-to-policy table before wiring runner behavior.
- Re-review trigger: Any change that lets markdown-only evidence override structured verdict failure.
- Verification evidence path: `docs/implementation/harness-worker-overhead-reduction-2026-05-07/execution/05-phase-05-completion-gate-reason-taxonomy-retry-policy-v1/QA_REPORT.md`

## Validation Plan

- [ ] `node .claude/scripts/agent-loop-phase-state.mjs self-test`
- [ ] `node --check .claude/scripts/agent-loop-phase-attempt.mjs`
- [ ] `node --check .claude/scripts/agent-loop-phase-runner.mjs`
- [ ] `node --test .claude/scripts/verify-phase-closeout.test.mjs`
- [ ] `bash .claude/scripts/verify-phase-runner-boundary.sh`

## Evidence To Mark Done

- Gate category fixture output.
- Runner decision fixture output for closeout-only and real verification-missing cases.
- Boundary verifier output.

## Deliverables

- Normalized gate reason taxonomy.
- Explicit retry policy table.
- Writer-only route for closeout-only gaps.

## Phase Completion Checklist

- [ ] Every known gate reason maps to a stable category.
- [ ] Every category maps to exactly one retry/remediation policy.
- [ ] Closeout-only gaps do not spawn broad implementation workers.
- [ ] Strict verification/score failures remain blocking.

## Handoff Notes

- Phase 06 should cache unavailable runtime capabilities using these normalized categories and policies.
