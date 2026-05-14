# Phase 04: Timeout Ledger Policy

```yaml
phaseExecution:
  schemaVersion: 1
  parallelEligible: false
  parallelGroup: "timeout-root-fixes"
  dependsOn:
    - "01-diagnostic-search-budget-v1.md"
    - "02-diff-output-budget-v1.md"
    - "03-runtime-parity-routing-v1.md"
  conflictsWith: []
  ownedPaths:
    - ".claude/scripts/agent-loop-phase-runtime.mjs"
    - ".claude/scripts/agent-loop-phase-runtime.test.mjs"
    - ".claude/scripts/agent-loop-phase-attempt.mjs"
    - ".claude/scripts/agent-loop-phase-attempt.test.mjs"
    - ".claude/scripts/agent-loop-phase-runner.mjs"
    - ".claude/scripts/agent-loop-phase-runner.test.mjs"
    - ".claude/scripts/lib/timeout-ledger.mjs"
    - ".claude/scripts/lib/timeout-ledger.test.mjs"
  readOnlyPaths:
    - ".claude/logs/agent-loop"
  sharedMutablePaths: []
  requiresManualEvidence: false
  mergePolicy: "sequential_patch"
```

## Source Mapping

- OBS-1 through OBS-6: timeout classes were only recoverable by manual log analysis.
- REQ-4, REQ-5, AC-6, AC-7.

## Goal

Add a timeout ledger and policy decision layer that converts timeout evidence into deterministic runner behavior.

## Scope

- Add JSONL ledger writer.
- Extend timeout classification.
- Connect classification to QA, HANDOFF, summary, and decision logs.
- Change same-run repeated timeout behavior according to class.

## Non-Goals

- Do not create a new state database.
- Do not replace existing summary and decision logs.
- Do not make all timeouts fatal; class-specific policy decides.

## Timeout Ledger Schema

```json
{
  "timestamp": "2026-05-14T13:08:42Z",
  "runId": "dispatch-...",
  "phase": 5,
  "command": "bash .claude/scripts/verify-phase-runtime-parity.sh ...",
  "commandFingerprint": "sha256:...",
  "timeoutMs": 124010,
  "class": "phaseRuntimeParity_timeout",
  "rootCause": "heavyweight_verifier_in_short_phase_loop",
  "retryPolicy": "do_not_retry_same_run; route_to_long_budget",
  "sameRunDecisionResult": "route_to_long_budget",
  "blockedVerdictPath": ".claude/verification-verdict-phase05-blocked.json"
}
```

Ledger path:

```text
.claude/logs/agent-loop/timeout-ledger.jsonl
```

Ledger write point:

- Write the ledger record at the timeout decision point after `agent-loop-phase-runtime.mjs` classifies timeout evidence and before `agent-loop-phase-runner.mjs` or `agent-loop-phase-attempt.mjs` schedules a retry, stop, or long-budget route.
- Store repeat-detection keys in the existing same-run runtime cache when available; otherwise add a small in-memory/file-backed same-run map keyed by `runId + phase + commandFingerprint + timeoutClass`.
- `commandFingerprint` is a stable SHA-256 hash of normalized executable, arguments, verifier id, runtime target, and reference plan hash. Do not include volatile timestamps or absolute temp log paths.
- `sameRunDecisionResult` values are exactly `do_not_retry`, `bounded_retry`, `route_to_long_budget`, or `stop_and_handoff`.
- JSONL append must be atomic from the process perspective, reject malformed records before writing, create parent directories when needed, and use Windows-safe path joins.

## Timeout Classes

| Class | Root Cause | Runner Policy |
| --- | --- | --- |
| `broad_search_timeout` | Diagnostic command scanned too much filesystem. | Stop broad search, record debug opt-in command, do not retry same run. |
| `raw_diff_output_timeout` | Worker dumped unbounded raw diff into transcript/log. | Retry only after switching to bounded diff summary; otherwise stop and handoff. |
| `phaseRuntimeParity_timeout` | Heavyweight parity verifier ran in short-budget loop. | Do not retry same run; write blocked verdict and route to long-budget final verification. |
| `upstream_runtime_stall` | Runtime process stalled or reconnect loop persisted. | Existing fallback/stop policy applies. |
| `unknown_timeout` | No stable class found. | One bounded retry allowed, then stop with log evidence. |

## Task Breakdown

| Task ID | Action | Files | Expected Signal |
| --- | --- | --- | --- |
| T1 | Add timeout ledger writer and tests. | `timeout-ledger.mjs`, `timeout-ledger.test.mjs` | JSONL record validates required fields, atomic append behavior, malformed record rejection, and Windows-safe path handling. |
| T2 | Extend classifier with three new timeout classes. | `agent-loop-phase-runtime.mjs`, `agent-loop-phase-runtime.test.mjs` | Fixtures classify OBS-1, OBS-2/3, and OBS-4/5/6 patterns. |
| T3 | Wire ledger writes into timeout handling before retry scheduling. | `agent-loop-phase-runner.mjs`, `agent-loop-phase-attempt.mjs` | Timeout writes ledger and shared reason code before any retry/stop/route decision is emitted. |
| T4 | Connect class to retry policy using outputs from Phases 01-03. | runner runtime / attempt runtime | Same-run repeated class changes behavior using exact classes `broad_search_timeout`, `raw_diff_output_timeout`, and `phaseRuntimeParity_timeout`. |

## Critical Scenarios

| SCN ID | Scenario | Command | Pass Signal | Evidence Path |
| --- | --- | --- | --- | --- |
| SCN-08 | OBS-1 broad search timeout writes no-retry ledger entry. | `node --test .claude/scripts/agent-loop-phase-runtime.test.mjs --test-name-pattern "broad search timeout ledger"` | `broad_search_timeout` record with `sameRunDecisionResult: "do_not_retry"`. | `docs/implementation/phase-runner-timeout-root-fixes-2026-05-14/qa/phase-04-qa.md` |
| SCN-09 | OBS-2/3 raw diff timeout switches to bounded retry policy. | `node --test .claude/scripts/agent-loop-phase-runner.test.mjs --test-name-pattern "raw diff retry policy"` | Retry instructions mention bounded diff summary and omit raw diff body. | `docs/implementation/phase-runner-timeout-root-fixes-2026-05-14/qa/phase-04-qa.md` |
| SCN-10 | OBS-4/5/6 parity timeout writes blocked long-budget route. | `node --test .claude/scripts/lib/timeout-ledger.test.mjs --test-name-pattern "parity timeout route"` | `phaseRuntimeParity_timeout` record includes blocked verdict path and `sameRunDecisionResult: "route_to_long_budget"`. | `docs/implementation/phase-runner-timeout-root-fixes-2026-05-14/qa/phase-04-qa.md` |
| SCN-11 | Same-run repeated timeout changes attempt-level scheduling. | `node --test .claude/scripts/agent-loop-phase-attempt.test.mjs --test-name-pattern "same run timeout policy"` | Attempt logic consumes ledger/cache key and selects `do_not_retry`, `bounded_retry`, or `route_to_long_budget` before launching a duplicate command. | `docs/implementation/phase-runner-timeout-root-fixes-2026-05-14/qa/phase-04-qa.md` |

## Validation Plan

```powershell
node --test .claude/scripts/lib/timeout-ledger.test.mjs
node --test .claude/scripts/agent-loop-phase-runtime.test.mjs
node --test .claude/scripts/agent-loop-phase-attempt.test.mjs
node --test .claude/scripts/agent-loop-phase-runner.test.mjs
git diff --check
```

## Blocker Condition

Stop if timeout classification cannot be made deterministic from the existing log surfaces. In that case, first add the minimum structured timeout markers to runner logs, then continue.

## Deliverables

- `.claude/logs/agent-loop/timeout-ledger.jsonl` policy surface.
- Timeout class to retry policy mapping.
- Shared reason code in QA, HANDOFF, summary, and decision logs.

## Phase Completion Checklist

- [ ] Timeout ledger validates and writes required schema.
- [ ] All observed timeout classes are classified.
- [ ] Runner behavior changes after repeated same-run timeout class.
