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
| REQ-1 | Diagnostic commands must not scan global npm/npx caches by default. Broad cache scans require explicit debug opt-in and tight limits. |
| REQ-2 | Worker and runner diff usage must default to bounded summary output and prevent unbounded raw `diff --git` transcript dumps. |
| REQ-3 | `phaseRuntimeParity` must not run as a repeated short-budget per-phase verifier. It must use optional probe in normal phase loops and required long-budget routing only when appropriate. |
| REQ-4 | Timeout events must be recorded once with class, root cause, retry policy, and blocker evidence path. |
| REQ-5 | Same-run repeated timeout class must alter runner behavior: no blind retry for parity timeout, no repeated broad search, and no repeated raw diff dump. |

## Acceptance Criteria

| AC ID | Req ID | Acceptance Criteria | Evidence Target |
| --- | --- | --- | --- |
| AC-1 | REQ-1 | `check-mcp.sh` and capability preflight resolve CRG/MCP availability without recursive npm cache search in default mode. | `node --test .claude/scripts/check-mcp.test.mjs`, `node --test .claude/scripts/phase-capability-preflight.test.mjs` |
| AC-2 | REQ-2 | Runner prompt and closeout helpers use `git diff --stat`, `git diff --name-only`, and `git diff --check` by default; raw diff is path-limited and capped. | `node --test .claude/scripts/agent-loop-phase-runner.test.mjs` |
| AC-3 | REQ-2 | Timeout classifier detects logs dominated by raw `diff --git` output as `raw_diff_output_timeout`. | `node --test .claude/scripts/agent-loop-phase-runtime.test.mjs` |
| AC-4 | REQ-3 | Normal phase loop runs runtime parity as `optional_probe` only, unless explicit final/long-budget routing is requested. | `node --test .claude/scripts/agent-loop-phase-runner.test.mjs`, `node --test .claude/scripts/lib/phase-closeout-verdict.test.mjs` |
| AC-5 | REQ-3 | A `phaseRuntimeParity_timeout` for the same `runId + verifierId + referencePlanHash + runtimeTarget` is not retried in the same run. | `node --test .claude/scripts/lib/runtime-unavailable-cache.test.mjs` or narrow equivalent |
| AC-6 | REQ-4 | Timeout ledger writes structured JSONL records with command, phase, timeoutMs, class, rootCause, retryPolicy, and blockedVerdictPath. | `node --test .claude/scripts/agent-loop-phase-runtime.test.mjs` |
| AC-7 | REQ-5 | QA, HANDOFF, summary, and decision log share the same timeout reason code and next route. | `node --test .claude/scripts/agent-loop-phase-runner.test.mjs` |

## Phase Index

| Phase | File | Purpose | Dependencies | Parallel |
| --- | --- | --- | --- | --- |
| 01 | `01-diagnostic-search-budget-v1.md` | Prevent broad diagnostic search timeouts in MCP/CRG checks. | None | No |
| 02 | `02-diff-output-budget-v1.md` | Prevent raw diff transcript timeouts while preserving required git evidence. | None | No |
| 03 | `03-runtime-parity-routing-v1.md` | Move heavyweight parity verification out of repeated short-budget phase loops. | Phase 01 | No |
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

- [ ] Phase 01 - Diagnostic Search Budget (`01-diagnostic-search-budget-v1.md`)
- [ ] Phase 02 - Diff Output Budget (`02-diff-output-budget-v1.md`)
- [ ] Phase 03 - Runtime Parity Routing (`03-runtime-parity-routing-v1.md`)
- [ ] Phase 04 - Timeout Ledger Policy (`04-timeout-ledger-policy-v1.md`)

## Plan Quality Loop

Status: controller draft only.

`moonshot-plan-writer` requires isolated Reviewer Agent and Writer Agent sessions for strict runnable readiness. The current user request named the skill but did not explicitly authorize sub-agents, so the Independent Planning Loop is pending permission.

Current controller decision: `controller_draft_pending_independent_review`.

## Verification Plan

Minimum commands after implementation:

```powershell
node --test .claude/scripts/check-mcp.test.mjs
node --test .claude/scripts/phase-capability-preflight.test.mjs
node --test .claude/scripts/agent-loop-phase-runtime.test.mjs
node --test .claude/scripts/agent-loop-phase-runner.test.mjs
node --test .claude/scripts/lib/phase-closeout-verdict.test.mjs
node --test .claude/scripts/lib/runtime-unavailable-cache.test.mjs
git diff --check
```

If a listed test file does not exist at implementation time, add the narrowest equivalent test near the changed module and record the replacement in phase QA evidence.
