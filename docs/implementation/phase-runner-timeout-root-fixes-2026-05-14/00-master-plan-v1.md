# Phase Runner Timeout Root Fixes

## Source Baseline

This package converts the 2026-05-14 timeout analysis into executable root-fix phases. The goal is not to add another passive timeout report. The goal is to change runner behavior so repeated timeout classes are either prevented, routed to the correct budget, or stopped with a precise reason and next command.

Observed timeout classes:

| Obs ID | Source | Symptom | Root Cause Class | Target Phase |
| --- | --- | --- | --- | --- |
| OBS-1 | `Transport closed` investigation | `rg` over npm/npx cache timed out after about 64s. | `broad_search_timeout` | Phase 01 |
| OBS-2 | simple state board Phase 4 | Worker output timed out after about 124s while dumping raw `diff --git` content. | `raw_diff_output_timeout` | Phase 02 |
| OBS-3 | simple state board Phase 4 | Worker output timed out after about 304s after failed recovery and repeated raw diff output. | `raw_diff_output_timeout` | Phase 02 |
| OBS-4 | runtime contract Phase 4 | `phaseRuntimeParity` timed out after about 124s. | `phaseRuntimeParity_timeout` | Phase 03 |
| OBS-5 | projection closeout Phase 4 | `phaseRuntimeParity` timed out after about 124s and produced blocked parity evidence. | `phaseRuntimeParity_timeout` | Phase 03 |
| OBS-6 | projection closeout Phase 5 | `phaseRuntimeParity` timed out again after about 124s. | `phaseRuntimeParity_timeout` | Phase 03 |

## Goal Contract

goalClarity: high
scopeClarity: high
acceptanceCriteriaClarity: high
verificationClarity: high
clarityScore: 0.91
ambiguityScore: 0.09
readinessDecision: controller_draft_pending_independent_review

Implement timeout prevention policy across diagnostic search, diff output, runtime parity routing, and timeout ledger decisions. The runner must stop repeating the same timeout class in the same run and must surface the reason and next route in QA, HANDOFF, summary, and decision logs.

## Non-Goals

- Do not remove `phaseRuntimeParity`; move it to the right execution budget.
- Do not ban `git diff`; restrict raw diff output and prefer summary commands.
- Do not add a database or event-sourcing layer.
- Do not modify current active runtime state as part of planning.
- Do not make MemoryGraph or code-review-graph strict by default.

## Requirements

| Req ID | Requirement |
| --- | --- |
| REQ-1 | Harness, runner, and agent diagnostic commands must not scan global npm/npx caches by default. Broad cache scans require `CRG_DEBUG_BROAD_SEARCH=true`, allowed roots limited to the active project plus the resolved package root, at most 200 files, and at most 10 seconds. |
| REQ-2 | Worker and runner diff usage must default to bounded summary output and prevent unbounded raw `diff --git` transcript dumps. |
| REQ-3 | `phaseRuntimeParity` must not run as a repeated short-budget per-phase verifier. Normal phase loops must resolve contract-driven parity checks to `optional_probe`; `required_runtime` is allowed only through explicit final or long-budget routing. |
| REQ-4 | Timeout events must be recorded once with class, root cause, retry policy, and blocker evidence path. |
| REQ-5 | Same-run repeated timeout class must alter runner behavior: no blind retry for parity timeout, no repeated broad search, and no repeated raw diff dump. |

## Acceptance Criteria

| AC ID | Req ID | Acceptance Criteria | Evidence Target |
| --- | --- | --- | --- |
| AC-1 | REQ-1 | `check-mcp.sh`, capability preflight, and runner diagnostic instructions resolve CRG/MCP availability without recursive npm cache search in default mode; debug search is limited to `CRG_DEBUG_BROAD_SEARCH=true`, active project root plus resolved package root, 200 files, and 10 seconds. | `node --test .claude/scripts/check-mcp.test.mjs`, `node --test .claude/scripts/phase-capability-preflight.test.mjs`, `node --test .claude/scripts/agent-loop-phase-runner.test.mjs --test-name-pattern "diagnostic search budget"` |
| AC-2 | REQ-2 | Runner prompt and closeout helpers use `git diff --stat`, `git diff --name-only`, and `git diff --check` by default; raw diff requires an explicit path allowlist and a 200-line maximum via `token-safe-git.sh`. | `node --test .claude/scripts/agent-loop-phase-runner.test.mjs --test-name-pattern "diff output budget"` |
| AC-3 | REQ-2 | Timeout classifier detects the synthetic OBS-2/3 large raw `diff --git` log fixture as `raw_diff_output_timeout` and retry instructions omit raw diff bodies. | `node --test .claude/scripts/agent-loop-phase-runtime.test.mjs --test-name-pattern "raw diff timeout"` |
| AC-4 | REQ-3 | Contract/profile routing proves that `.claude/verification.contract.yaml` parity requirements no longer schedule `required_runtime` in normal short-budget phase loops; the selected profile is `optional_probe` unless final or long-budget routing is explicit. | `node --test .claude/scripts/agent-loop-phase-runner.test.mjs --test-name-pattern "contract parity optional probe"`, `node --test .claude/scripts/lib/phase-closeout-verdict.test.mjs --test-name-pattern "parity routing"` |
| AC-5 | REQ-3 | A `phaseRuntimeParity_timeout` for the same `runId + verifierId + referencePlanHash + runtimeTarget` is not retried in the same run and records `sameRunDecisionResult: "route_to_long_budget"`. | `node --test .claude/scripts/lib/runtime-unavailable-cache.test.mjs --test-name-pattern "phase runtime parity same run timeout"` |
| AC-6 | REQ-4 | Timeout ledger writes structured JSONL records at the timeout decision point with `runId`, `phase`, command fingerprint, timeout class, retry policy, `sameRunDecisionResult`, and blocker path. | `node --test .claude/scripts/lib/timeout-ledger.test.mjs`, `node --test .claude/scripts/agent-loop-phase-runtime.test.mjs --test-name-pattern "timeout ledger"` |
| AC-7 | REQ-5 | QA, HANDOFF, summary, and decision log share the same timeout reason code and next route for OBS-1, OBS-2/3, and OBS-4/5/6 no-regression fixtures. | `node --test .claude/scripts/agent-loop-phase-runner.test.mjs --test-name-pattern "timeout policy no regression"` |

## Phase Index

| Phase | File | Purpose | Dependencies | Parallel |
| --- | --- | --- | --- | --- |
| 01 | `01-diagnostic-search-budget-v1.md` | Prevent broad diagnostic search timeouts in MCP/CRG checks. | None | No |
| 02 | `02-diff-output-budget-v1.md` | Prevent raw diff transcript timeouts while preserving required git evidence. | Phase 01 | No |
| 03 | `03-runtime-parity-routing-v1.md` | Move heavyweight parity verification out of repeated short-budget phase loops. | Phases 01-02 | No |
| 04 | `04-timeout-ledger-policy-v1.md` | Add timeout ledger and policy decisions that connect classes to runner behavior. | Phases 01-03 | No |

## Parallel Execution Plan

Keep this package sequential. Phase 01 and Phase 02 touch separate concepts but both affect runner prompts and timeout classification behavior. Phase 03 depends on runtime availability semantics from Phase 01. Phase 04 must consume all final timeout classes and policies.

## Source Traceability

| Observation | Requirement | AC | Phase |
| --- | --- | --- | --- |
| OBS-1 | REQ-1 | AC-1 | 01 |
| OBS-2 | REQ-2 | AC-2, AC-3 | 02 |
| OBS-3 | REQ-2, REQ-5 | AC-2, AC-3, AC-7 | 02, 04 |
| OBS-4 | REQ-3, REQ-5 | AC-4, AC-5 | 03, 04 |
| OBS-5 | REQ-3, REQ-4, REQ-5 | AC-4, AC-5, AC-6, AC-7 | 03, 04 |
| OBS-6 | REQ-3, REQ-5 | AC-4, AC-5, AC-7 | 03, 04 |

## Phase Completion Checklist

- [x] Phase 01 - Diagnostic Search Budget (`01-diagnostic-search-budget-v1.md`)
- [x] Phase 02 - Diff Output Budget (`02-diff-output-budget-v1.md`)
- [x] Phase 03 - Runtime Parity Routing (`03-runtime-parity-routing-v1.md`)
- [ ] Phase 04 - Timeout Ledger Policy (`04-timeout-ledger-policy-v1.md`)

## Plan Quality Loop

Status: review loop passed after revision iteration 1 and Reviewer Agent iteration 2.

The Independent Planning Loop completed with separate Reviewer and Writer sessions:

- Iteration 1 Reviewer Agent result: `revise`, ambiguityScore `0.28`, three blocking findings.
- Writer Agent revision: `planning-loop/plan-writer-revision-iter-01.yaml`.
- Iteration 2 Reviewer Agent result: `pass`, ambiguityScore `0.14`, zero blocking findings.

Current controller decision: `review_passed_ready`.

## Verification Plan

Minimum commands after implementation:

```powershell
node --test .claude/scripts/check-mcp.test.mjs
node --test .claude/scripts/phase-capability-preflight.test.mjs
node --test .claude/scripts/agent-loop-phase-runtime.test.mjs
node --test .claude/scripts/agent-loop-phase-runner.test.mjs
node --test .claude/scripts/lib/phase-closeout-verdict.test.mjs
node --test .claude/scripts/lib/runtime-unavailable-cache.test.mjs
node --test .claude/scripts/lib/timeout-ledger.test.mjs
git diff --check
```

The implementation must add the listed test files if any are missing. Phase QA evidence paths are fixed per phase under `docs/implementation/phase-runner-timeout-root-fixes-2026-05-14/qa/phase-0N-qa.md`.
