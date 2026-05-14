# Phase 05: Runtime Dependency Health Reconciliation

```yaml
phaseExecution:
  schemaVersion: 1
  parallelEligible: false
  parallelGroup: "runtime-health"
  dependsOn:
    - "02-latest-dispatch-terminal-liveness-v1.md"
    - "04-post-closeout-reconcile-barrier-v1.md"
  conflictsWith:
    - "02-latest-dispatch-terminal-liveness-v1.md"
    - "04-post-closeout-reconcile-barrier-v1.md"
  ownedPaths:
    - ".claude/scripts/phase-capability-preflight.mjs"
    - ".claude/scripts/phase-capability-preflight.test.mjs"
    - ".claude/scripts/check-mcp.sh"
    - ".claude/scripts/check-mcp.test.mjs"
    - ".claude/scripts/code-review-graph-mcp-wrapper.js"
    - ".claude/scripts/memorygraph-mcp-wrapper.mjs"
    - ".claude/scripts/lib/harness-state-invariants.mjs"
    - ".claude/scripts/lib/harness-state-invariants.test.mjs"
  readOnlyPaths:
    - ".claude/logs/memorygraph"
    - ".claude/logs/code-review-graph"
    - ".codex/config.toml"
  sharedMutablePaths: []
  requiresManualEvidence: false
  mergePolicy: "sequential_patch"
```

## Source Mapping

- REQ-5: MemoryGraph unavailable projection needs freshness and decay semantics.
- REQ-6: native CRG MCP transport failure needs root-cause diagnosis beyond CLI fallback.
- AC-6, AC-7.

## Goal

Make runtime dependency health records actionable and non-stale. Non-strict unavailable evidence should not poison current projections after a later successful health check. Native MCP transport failures should be recorded once per run with actionable diagnostics and a CLI fallback path.

## Scope

Patch capability preflight, MCP health diagnostics, and invariant interpretation. Do not force a Codex Desktop restart from scripts.

## MemoryGraph Freshness and Decay Contract

MemoryGraph unavailable evidence must be represented as a time-bounded capability record, not a permanent projection poison pill.

Required fields:

| Field | Meaning |
| --- | --- |
| `capability` | Fixed value `memorygraph`. |
| `strict` | Boolean copied from the active verification contract. |
| `status` | One of `healthy`, `unavailable`, `stale`, `superseded`. |
| `observedAt` | ISO timestamp for the probe that produced this record. |
| `runId` | Current phase runner id or `unknown` when unavailable. |
| `checkId` | Stable probe id for this capability check within the run. |
| `lastHealthyAt` | ISO timestamp for the latest successful probe, or absent. |
| `lastUnavailableAt` | ISO timestamp for the latest unavailable probe, or absent. |
| `freshnessState` | One of `current`, `stale`, `recovered`. |
| `decayReason` | One of `healthy_probe`, `new_run`, `strict_block`, or absent. |
| `decayedAt` | ISO timestamp when a stale non-strict unavailable record was superseded, or absent. |

Pass/fail rules:

- A strict `unavailable` record is always a blocking invariant until a later `healthy` record for the same capability and run is observed.
- A non-strict `unavailable` record is a warning only while `freshnessState: "current"` and no later `healthy` record exists.
- A later `healthy` MemoryGraph probe in the same run must mark prior non-strict unavailable records as `status: "superseded"`, `freshnessState: "recovered"`, `decayReason: "healthy_probe"`, and set `decayedAt`.
- A new run must not inherit a previous run's non-strict unavailable warning as current. If retained for audit, it must be `status: "stale"`, `freshnessState: "stale"`, and `decayReason: "new_run"`.
- Invariant tests pass only when current projections contain no non-strict MemoryGraph warning after a same-run healthy probe, while strict unavailable still blocks before recovery.

## CRG MCP Diagnostic Record Contract

Native code-review-graph MCP transport failures must write one durable diagnostic record and then use CLI fallback evidence instead of retrying the same dead native transport repeatedly in the same run.

Storage path:

- `.claude/logs/code-review-graph/mcp-diagnostics.jsonl`

Required diagnostic fields:

| Field | Meaning |
| --- | --- |
| `schemaVersion` | Integer, currently `1`. |
| `tool` | Fixed value `code-review-graph`. |
| `transport` | Fixed value `native_mcp`. |
| `runId` | Current phase runner id or `unknown` when unavailable. |
| `cacheKey` | Same-run unavailable cache key, exactly `code-review-graph:native_mcp:<runId>`. |
| `observedAt` | ISO timestamp for the failed native probe. |
| `failureClass` | Stable class such as `transport_closed`, `spawn_failed`, `timeout`, or `protocol_error`. |
| `rootCause` | Short actionable summary derived from stderr, exit signal, exception name, or protocol close reason. |
| `nativeAttempted` | Boolean, `true` for the record that observed the native failure. |
| `nativeSuppressed` | Boolean, `true` for later same-run checks served by the unavailable cache. |
| `resetCondition` | Fixed text `new_run_or_successful_native_probe`. |
| `fallbackKind` | Fixed value `cli`. |
| `fallbackCommand` | Exact CLI fallback command invoked by `check-mcp.sh` or wrapper. |
| `fallbackExitCode` | Numeric CLI fallback exit code. |
| `fallbackEvidencePath` | Path to the CLI fallback evidence artifact or log. |
| `fallbackRange` | Review range used by fallback evidence, when available. |

Same-run unavailable cache:

- Cache key: `code-review-graph:native_mcp:<runId>`.
- Set the key after the first native MCP transport failure in a run.
- While the key is set, later same-run checks must skip native MCP and append or expose fallback CLI evidence with `nativeSuppressed: true`.
- Reset the key when `runId` changes or when a native MCP probe succeeds.

Fallback evidence fields required for pass:

- `fallbackKind: "cli"`
- `fallbackCommand`
- `fallbackExitCode`
- `fallbackEvidencePath`
- `fallbackRange` when the caller provided a review range
- `nativeSuppressed: true` on repeated same-run checks after the first failure

## Task Breakdown

| Task ID | Action | Files | Expected Signal |
| --- | --- | --- | --- |
| T1 | Add MemoryGraph unavailable fixture with stale non-strict warning and later healthy check. | capability/invariant tests | Stale warning currently persists. |
| T2 | Add freshness fields and decay behavior for non-strict MemoryGraph warnings. | preflight/invariant | Successful health clears stale warning. |
| T3 | Add CRG MCP transport failure fixture with repeated same-run failure. | check-mcp/wrapper tests | Repeated dead transport calls are visible. |
| T4 | Record actionable CRG MCP diagnostics and suppress repeated same-run native attempts after failure while preserving CLI fallback evidence. | wrapper/check script | Diagnostics are stable. |

## Critical Scenarios

| SCN ID | Scenario | Command | Pass Signal | Evidence Path |
| --- | --- | --- | --- | --- |
| SCN-09 | Non-strict MemoryGraph unavailable decays after healthy probe. | `node --test .claude/scripts/phase-capability-preflight.test.mjs` | stale warning removed or marked superseded. | QA_REPORT.md |
| SCN-10 | Strict MemoryGraph unavailable still blocks. | `node --test .claude/scripts/lib/harness-state-invariants.test.mjs` | strict violation remains. | QA_REPORT.md |
| SCN-11 | CRG MCP transport failure records root cause and uses CLI fallback. | `node --test .claude/scripts/check-mcp.test.mjs` | one diagnostic record, no repeated dead call loop. | QA_REPORT.md |

## Validation Plan

```powershell
node --test .claude/scripts/phase-capability-preflight.test.mjs
node --test .claude/scripts/lib/harness-state-invariants.test.mjs
node --test .claude/scripts/check-mcp.test.mjs
node --test .claude/scripts/lib/failure-classifier.test.mjs
bash -n .claude/scripts/check-mcp.sh
git diff --check
```

## Blocker Condition

Stop if CRG MCP transport root cause cannot be reproduced without Codex Desktop internals. In that case, implement only durable diagnostics and same-run unavailable caching, and record live restart as an operator action.

## Deliverables

- MemoryGraph unavailable freshness/decay semantics.
- CRG MCP diagnostic and unavailable-cache behavior.

## Phase Completion Checklist

- [ ] Non-strict MemoryGraph warning does not remain stale after health recovery.
- [ ] Strict memory mode still blocks.
- [ ] CRG MCP failure is diagnostic, bounded, and has CLI fallback evidence.
