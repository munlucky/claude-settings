# Phase 05: Runtime Dependency Health Reconciliation

```yaml
phaseExecution:
  schemaVersion: 1
  parallelEligible: true
  parallelGroup: "runtime-health"
  dependsOn: []
  conflictsWith: []
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
  mergePolicy: "disjoint_patch"
```

## Source Mapping

- REQ-5: MemoryGraph unavailable projection needs freshness and decay semantics.
- REQ-6: native CRG MCP transport failure needs root-cause diagnosis beyond CLI fallback.
- AC-6, AC-7.

## Goal

Make runtime dependency health records actionable and non-stale. Non-strict unavailable evidence should not poison current projections after a later successful health check. Native MCP transport failures should be recorded once per run with actionable diagnostics and a CLI fallback path.

## Scope

Patch capability preflight, MCP health diagnostics, and invariant interpretation. Do not force a Codex Desktop restart from scripts.

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
| SCN-11 | CRG MCP transport failure records root cause and uses CLI fallback. | focused MCP test | one diagnostic record, no repeated dead call loop. | QA_REPORT.md |

## Validation Plan

```powershell
node --test .claude/scripts/phase-capability-preflight.test.mjs
node --test .claude/scripts/lib/harness-state-invariants.test.mjs
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
