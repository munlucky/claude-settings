# Phase 08: Composite Monitor And Noise Routing (v1)

## Source Mapping
| Req ID | AC ID | Source Section | Requirement Summary | This Phase Handling |
|--------|-------|----------------|---------------------|---------------------|
| REQ-1.12 | AC-12 | Plan v10 / Later Slices | Monitor uses composite cursor and warning noise goes to waste-ledger. | Update monitor inputs and warning routing. |

## Goal
- Make monitoring and warning classification follow the new current-source model instead of parent JSONL or noisy runtime output alone.

## Expected Outcome
- Heartbeat/monitor status reads current index, manifest, lease, phase-status, workflow logs, and active verdict hash/mtime together.
- Plugin/MCP warning noise is recorded in `waste-ledger`, while publish diagnostics remain in `closeout-diagnostics.jsonl`.

## Phase Execution Metadata
```yaml
phaseExecution:
  schemaVersion: 1
  parallelEligible: false
  parallelGroup: "wave-6"
  dependsOn: ["01", "03", "07"]
  conflictsWith: []
  ownedPaths:
    - ".claude/scripts/phase-run-lease.mjs"
    - ".claude/scripts/lib/phase-run-lease-status.mjs"
    - ".claude/scripts/moonshot-phase-dispatch.mjs"
    - ".claude/scripts/lib/waste-ledger.mjs"
  readOnlyPaths:
    - ".claude/scripts/lib/current-artifacts-state.mjs"
    - ".claude/scripts/lib/closeout-diagnostics.mjs"
    - ".claude/logs/workflow-enforcement/**"
  sharedMutablePaths: []
  requiresManualEvidence: false
  mergePolicy: "sequential_monitor_contract"
```

## Scope
- Included:
  - Composite cursor contract.
  - Monitor stale/no-change behavior based on composite inputs.
  - Warning/noise hook owner routing.
  - Diagnostic/waste ledger separation.
- Excluded:
  - New automation scheduler.
  - Broad runtime wrapper rewrite.

## Detailed Tasks
| ID | Task | Steps | Done Criteria |
|----|------|-------|---------------|
| P08-1 | Add composite cursor | Read current index, manifest hash, phase-run-lease status, phase-status, workflow logs, and active verdict metadata. | Parent JSONL alone is no longer enough to report stale no-change. |
| P08-2 | Update monitor stale logic | Mark stale only when composite cursor is unchanged. | Active child log/verdict/manifest changes prevent stale report. |
| P08-3 | Route warning noise | Send plugin manifest, skill icon, MCP shutdown, and deprecation warnings to `waste-ledger`. | Warning-only events do not become blocker/failed verdicts. |
| P08-4 | Keep publish diagnostics separate | Ensure `orphaned_prepare_archive` and current hash failures use `closeout-diagnostics.jsonl`, not waste-ledger. | Ledger responsibilities are distinct. |

## Exact Execution Targets
| ID | Create Files | Modify Files | Test Files | Command | Expected Fail/Pass Signal |
|----|--------------|--------------|------------|---------|---------------------------|
| P08-1 | none | monitor/lease status scripts | monitor tests | `pwsh -NoProfile -File .claude/scripts/run-node-tests-direct.ps1 .claude/scripts/*.test.mjs` | composite cursor detects non-parent changes. |
| P08-3 | none | `.claude/scripts/moonshot-phase-dispatch.mjs`, `.claude/scripts/lib/waste-ledger.mjs` | waste ledger tests | `pwsh -NoProfile -File .claude/scripts/run-node-tests-direct.ps1 .claude/scripts/*.test.mjs` | warning-only events route to waste ledger. |

## Critical Product Scenarios
| Scenario | User-visible Expectation | Proof Command | Expected Pass Signal | Evidence Path |
|----------|--------------------------|---------------|----------------------|---------------|
| SCN-14 | Monitor does not report stale while manifest/current evidence changes. | composite cursor test | changed manifest prevents stale result. | monitor test output |
| SCN-15 | MCP/plugin warnings do not become closeout blockers. | waste ledger routing test | warning classified as noise. | waste ledger test output |

## Blockers And Review
- Blocker condition: monitor still uses parent JSONL as sole progress source.
- First review checkpoint: composite cursor field list review.
- Verification evidence path: monitor and waste ledger test outputs.

## Validation Plan
- [ ] `pwsh -NoProfile -File .claude/scripts/run-node-tests-direct.ps1 .claude/scripts/*.test.mjs`
- [ ] `node .claude/scripts/workflow-enforcement.mjs verify`

## Deliverables
- Composite monitor cursor behavior.
- Warning/noise routing to waste-ledger.
- Distinct closeout diagnostics vs warning noise evidence.

## Phase Completion Checklist
- [ ] Parent JSONL is not the sole stale source.
- [ ] Warning noise does not influence blocker verdicts.
- [ ] Closeout diagnostics remain separate from waste-ledger.
