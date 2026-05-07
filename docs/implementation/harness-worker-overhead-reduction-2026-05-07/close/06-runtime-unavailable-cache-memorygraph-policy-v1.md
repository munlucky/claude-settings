# Phase 06: Runtime Unavailable Cache And MemoryGraph Policy (v1)

## Source Mapping

| Req ID | Source Section | Requirement Summary | This Phase Handling |
|---|---|---|---|
| HWO-004 | User overhead item 4 | MCP cleanup failures should not repeat per attempt | Cache unavailable cleanup/runtime class per run |
| HWO-005 | User overhead item 5 | MemoryGraph `Transport closed` should not repeat in closeout/remediation attempts | Add run-level unavailable cache and non-strict memory policy |
| HWO-007 | User overhead item 7 | plugin/PATH/network startup tax should not repeat after known unavailable state | Cache startup unavailable capabilities |
| HWO-011 | Prior MWR-013/MWR-015 | repeated warnings summarized | Record once per run with evidence pointer |

## Goal

- Cache runtime unavailable capability findings at the run level so repeated attempts do not re-probe or re-log the same unavailable path.

## Expected Outcome

- MemoryGraph MCP unavailable, plugin network sync unavailable, PATH mutation denied, and MCP cleanup EPERM are recorded once per run as unavailable capabilities.
- Later closeout/remediation attempts read the cached state and emit a short summary instead of repeating full probes or warnings.
- MemoryGraph unavailable remains non-blocking unless a strict memory gate is explicitly enabled.

## Phase Execution Metadata

```yaml
phaseExecution:
  schemaVersion: 1
  parallelEligible: false
  parallelGroup: "wave-5"
  dependsOn:
    - "02"
    - "05"
  conflictsWith:
    - "05"
    - "07"
  ownedPaths:
    - ".claude/scripts/phase-run-lease.mjs"
    - ".claude/scripts/agent-loop-phase-runtime.mjs"
    - ".claude/scripts/moonshot-phase-dispatch.mjs"
    - ".claude/scripts/phase-capability-preflight.mjs"
    - ".claude/scripts/commit-moonshot-memory-refresh.mjs"
  readOnlyPaths:
    - ".claude/scripts/lib/failure-classifier.mjs"
    - ".claude/docs/guidelines/memorygraph-workflow.md"
    - ".claude/docs/phase-status.yaml"
  sharedMutablePaths: []
  requiresManualEvidence: false
  mergePolicy: "sequential_shared_harness"
```

## Scope

- In scope:
  - Add run-level `unavailableCapabilities` representation to lease/status runtime metadata or a dedicated runtime state artifact.
  - Cache classified unavailable findings by code, fingerprint, firstSeenAt, source, evidencePath, and strictness.
  - Add read path that suppresses repeated probe attempts for already-known unavailable capabilities in the same run.
  - Preserve strict memory validation if a future strict memory gate explicitly asks for it.
- Out of scope:
  - Making MemoryGraph writes mandatory.
  - Changing MemoryGraph data model.
  - Suppressing first occurrence evidence.

## Preconditions And Inputs

- Phases 02 and 05 are merged.
- Required current code:
  - `.claude/scripts/phase-run-lease.mjs`
  - `.claude/scripts/agent-loop-phase-runtime.mjs`
  - `.claude/scripts/moonshot-phase-dispatch.mjs`
  - `.claude/scripts/phase-capability-preflight.mjs`

## Detailed Tasks

| ID | Task | Steps | Done Criteria |
|---|---|---|---|
| P06-1 | Define unavailable cache shape | Add run-scoped fields for code, fingerprint, source, firstSeenAt, lastSeenAt, evidencePath, strict | Cache can be read without parsing long logs |
| P06-2 | Record first occurrence | Write cache entry when classifier/preflight sees MemoryGraph, plugin network, PATH update, or MCP cleanup unavailable | First occurrence keeps evidence path |
| P06-3 | Suppress repeated probes/logs | Before repeated recall/probe/startup handling, check cache and emit summary | Same code does not repeat full warning in later attempts |
| P06-4 | Preserve strict mode | Allow strict memory gate to override non-blocking unavailable policy | Strict mode can still block explicitly |

## Critical Product Scenarios

| ID | User-Visible Expectation | Verification Command | Expected Signal | Evidence Path |
|---|---|---|---|---|
| SCN-P06-1 | MemoryGraph transport failure is recorded once per run | targeted cache fixture | first event records full detail; second event emits cached summary | `QA_REPORT.md` fixture output |
| SCN-P06-2 | Non-strict MemoryGraph unavailable does not fail phase completion | targeted runtime/gate fixture | blocker class is warning/non-blocking unless strict mode set | `QA_REPORT.md` fixture output |
| SCN-P06-3 | PATH/plugin unavailable avoids repeated startup tax | targeted cache fixture | same fingerprint suppressed on second observation | `QA_REPORT.md` fixture output |

## Exact Execution Targets

| ID | Files To Create | Files To Modify | Files To Test | Commands | Expected Fail/Pass Signals |
|---|---|---|---|---|---|
| P06-1 | optional temp fixture only | `.claude/scripts/phase-run-lease.mjs` | self-test if present or new fixture | `node --check .claude/scripts/phase-run-lease.mjs` | Exit 0 |
| P06-2 | none | `.claude/scripts/phase-capability-preflight.mjs`, `.claude/scripts/agent-loop-phase-runtime.mjs` | cache fixture | `node --check .claude/scripts/phase-capability-preflight.mjs && node --check .claude/scripts/agent-loop-phase-runtime.mjs` | Exit 0 |
| P06-3 | none | `.claude/scripts/moonshot-phase-dispatch.mjs` | dispatch fixture if added | `node --check .claude/scripts/moonshot-phase-dispatch.mjs` | Exit 0 |
| P06-4 | none | `.claude/scripts/commit-moonshot-memory-refresh.mjs` if needed | memory refresh smoke | `node --check .claude/scripts/commit-moonshot-memory-refresh.mjs` | Exit 0 |

## Blockers And Review

- Blocker condition: Cache suppresses a strict required verification probe or hides first occurrence evidence.
- First review checkpoint: Review cache persistence location before writing to status/lease/runtime state.
- Re-review trigger: Any change to `.claude/docs/phase-status.yaml` root field names.
- Verification evidence path: `docs/implementation/harness-worker-overhead-reduction-2026-05-07/execution/06-phase-06-runtime-unavailable-cache-memorygraph-policy-v1/QA_REPORT.md`

## Validation Plan

- [ ] Syntax checks for touched runtime/lease/preflight files.
- [ ] Cache fixture demonstrating first vs repeated unavailable behavior.
- [ ] `node .claude/scripts/phase-capability-preflight.mjs --json`
- [ ] `node .claude/scripts/memorygraph-direct.mjs health`
- [ ] `node --test .claude/scripts/verify-phase-closeout.test.mjs`

## Evidence To Mark Done

- Cache fixture output.
- MemoryGraph direct health or unavailable summary evidence.
- Closeout test output showing no pass/fail semantic regression.

## Deliverables

- Run-level unavailable capability cache.
- MemoryGraph non-strict unavailable policy wiring.
- Startup warning suppression path.

## Phase Completion Checklist

- [ ] First unavailable occurrence keeps evidence.
- [ ] Repeated unavailable occurrence is summarized.
- [ ] Strict memory mode can still block.
- [ ] Runtime and closeout tests pass.

## Handoff Notes

- Phase 07 must add regression coverage so cache and redaction behavior do not regress.
