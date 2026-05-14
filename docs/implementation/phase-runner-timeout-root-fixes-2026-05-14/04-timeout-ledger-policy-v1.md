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
  "timeoutMs": 124010,
  "class": "phaseRuntimeParity_timeout",
  "rootCause": "heavyweight_verifier_in_short_phase_loop",
  "retryPolicy": "do_not_retry_same_run; route_to_long_budget",
  "blockedVerdictPath": ".claude/verification-verdict-phase05-blocked.json"
}
```

Ledger path:

```text
.claude/logs/agent-loop/timeout-ledger.jsonl
```

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
| T1 | Add timeout ledger writer and tests. | `timeout-ledger.mjs` | JSONL record validates required fields. |
| T2 | Extend classifier with three new timeout classes. | `agent-loop-phase-runtime.mjs` | Fixtures classify OBS-1/2/4 patterns. |
| T3 | Wire ledger writes into timeout handling. | `agent-loop-phase-runner.mjs` | Timeout writes ledger and shared reason code. |
| T4 | Connect class to retry policy. | runner runtime | Same-run repeated class changes behavior. |

## Critical Scenarios

| SCN ID | Scenario | Command | Pass Signal | Evidence Path |
| --- | --- | --- | --- | --- |
| SCN-08 | Broad search timeout writes no-retry ledger entry. | `node --test .claude/scripts/agent-loop-phase-runtime.test.mjs` | `broad_search_timeout` record. | QA_REPORT.md |
| SCN-09 | Raw diff timeout switches to bounded retry policy. | `node --test .claude/scripts/agent-loop-phase-runner.test.mjs` | Retry instructions mention bounded diff summary. | QA_REPORT.md |
| SCN-10 | Parity timeout writes blocked route. | `node --test .claude/scripts/lib/timeout-ledger.test.mjs` | `phaseRuntimeParity_timeout` record includes blocked verdict path. | QA_REPORT.md |

## Validation Plan

```powershell
node --test .claude/scripts/lib/timeout-ledger.test.mjs
node --test .claude/scripts/agent-loop-phase-runtime.test.mjs
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
