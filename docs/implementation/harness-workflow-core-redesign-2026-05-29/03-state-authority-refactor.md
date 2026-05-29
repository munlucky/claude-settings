# Phase 03 - State Authority Refactor

```yaml
phaseExecution:
  schemaVersion: 1
  parallelEligible: false
  parallelGroup: workflow-core
  dependsOn:
    - "01-readiness-closeout"
    - "02-control-plane-registry"
  conflictsWith:
    - "04-evidence-pipeline-split"
    - "06-runtime-capability-taxonomy"
  ownedPaths:
    - "docs/implementation/harness-workflow-core-redesign-2026-05-29/execution/staging/phase-03/**"
    - "docs/implementation/harness-workflow-core-redesign-2026-05-29/execution/phase-03/**"
  stagedOwnedPaths:
    - ".claude/scripts/phase-state-board.mjs"
    - ".claude/scripts/phase-state-board.test.mjs"
    - ".claude/scripts/workflow-enforcement.mjs"
    - ".claude/scripts/phase-closeout*.mjs"
    - ".claude/scripts/fixtures/state-board/**"
  adoptionTargets:
    - ".claude/scripts/phase-state-board.mjs"
    - ".claude/scripts/phase-state-board.test.mjs"
    - ".claude/scripts/workflow-enforcement.mjs"
    - ".claude/scripts/phase-closeout*.mjs"
    - ".claude/scripts/fixtures/state-board/**"
  readOnlyPaths:
    - ".claude/docs/phase-status.yaml"
    - ".claude/logs/workflow-enforcement/**"
    - "docs/implementation/**"
  sharedMutablePaths:
    - "docs/implementation/harness-workflow-core-redesign-2026-05-29/execution/staging/phase-03/**"
  requiresManualEvidence: false
  mergePolicy: sequential_shared_contract
  liveMutationPolicy:
    liveClaudeWrites: prohibited
    stagingRoot: "docs/implementation/harness-workflow-core-redesign-2026-05-29/execution/staging/phase-03"
    adoptionPhase: "08-controlled-harness-adoption"
```

## Objective

Make one compact state board/read model authoritative for active plan, active phase, run id, dispatch id, verifier verdict id, forked-agent attempt state, parent-owned diff/evidence collection state, stale warnings, and next valid action.

This phase produces a staged overlay only. The `.claude/**` paths above are intended adoption targets, not permission to mutate the live harness during Phase 03.

## AC Mapping

| AC ID | Source | Expected Evidence | Expected Pass Signal |
|---|---|---|---|
| AC-003 | RC2 | State board JSON and tests | `status --json` exposes one authoritative next action |
| AC-004 | RC2 | Stale projection fixture | Stale dispatch/current-run projection becomes typed warning, not current truth |
| AC-014 | RC6 | State board JSON and fallback fixture | Forked-agent attempt identity and parent evidence collection are first-class; delegated-terminal/agent-loop is warning-marked fallback only |
| AC-015 | RC6 | Status/closeout adapter checks | Scripts produce deterministic status/finalizer output without owning primary phase orchestration or retry loops |

## Overlay Execution

All task commands in this phase run with:

```text
HARNESS_OVERLAY_ROOT=docs/implementation/harness-workflow-core-redesign-2026-05-29/execution/staging/phase-03
```

Resolve staged `.claude/scripts/**` from `HARNESS_OVERLAY_ROOT` first and pass `--overlay-root $HARNESS_OVERLAY_ROOT` to status, closeout, and test fixtures. Live `.claude` may be read as baseline only.

## Tasks

| Task | Files / Modules | Commands | Fail Signal | Pass Signal | Evidence Path | Review Checkpoint |
|---|---|---|---|---|---|---|
| T01 | Staged state board module | `node --check $HARNESS_OVERLAY_ROOT/.claude/scripts/phase-state-board.mjs`; `node --test $HARNESS_OVERLAY_ROOT/.claude/scripts/phase-state-board.test.mjs` | Board reads root docs as phase truth, returns conflicting next actions, or omits forked-agent attempt state | Board reads selected status/read model and emits one next action with forked-agent attempt identity | `execution/phase-03/state-board-test.txt` | Board schema must remain compact |
| T02 | Staged stale warning fixture | `node --test $HARNESS_OVERLAY_ROOT/.claude/scripts/phase-state-board.test.mjs --test-name-pattern stale --overlay-root $HARNESS_OVERLAY_ROOT` | Stale dispatch accepted as current or delegated-terminal fallback accepted as primary without warning | Fixture returns `staleReadModelWarnings` and typed fallback warning for delegated-terminal/agent-loop mode | `execution/phase-03/stale-fixture.txt` | Warning type must be machine-readable |
| T03 | Staged workflow enforcement status adapter | `node $HARNESS_OVERLAY_ROOT/.claude/scripts/workflow-enforcement.mjs status --json --overlay-root $HARNESS_OVERLAY_ROOT` | Output omits state board fields, recomputes independently, or lacks parent evidence collection state | Output includes board-derived active phase, status, next action, forked-agent attempt state, and parent-owned evidence collection state | `execution/phase-03/status-json.txt` | Adapter must not become a second authority |
| T04 | Staged closeout reader check | `node $HARNESS_OVERLAY_ROOT/.claude/scripts/<phase-closeout>.mjs --overlay-root $HARNESS_OVERLAY_ROOT` or equivalent staged closeout fixture | Clean finish happens while board has blocking stale warning or uncollected parent evidence | Closeout reads board before terminal decision and blocks when parent evidence collection is incomplete | `execution/phase-03/closeout-reader.txt` | Terminal decision source must be explicit |
| T05 | Staged fallback adapter semantics | `node --test $HARNESS_OVERLAY_ROOT/.claude/scripts/phase-state-board.test.mjs --test-name-pattern fallback --overlay-root $HARNESS_OVERLAY_ROOT` | `agent-loop.mjs` or delegated-terminal state is treated as the primary execution path when forked-agent is available | Board marks delegated-terminal/agent-loop as `fallbackExecutionMode` with stale-warning semantics unless registry selects fallback/headless mode | `execution/phase-03/fallback-fixture.txt` | Fallback must be visible, typed, and non-authoritative for primary execution |

## Blockers

- Existing status/closeout path has no safe insertion point for the board.
- Board output cannot represent forked-agent attempt identity, parent evidence collection, and delegated-terminal fallback state.
- Tests cannot create deterministic stale projection fixtures.
- Fallback/headless execution cannot be distinguished from stale delegated-terminal state.
- Closeout/finalizer cannot block terminal success when parent evidence collection is incomplete.
- Any required check cannot run against the staged overlay or dry-run mode without mutating live `.claude`.

## Completion Criteria

- State board module and tests pass.
- Stale runtime projections are reported as typed warnings.
- Workflow status JSON uses board fields and includes forked-agent attempt identity plus parent evidence collection state.
- Delegated-terminal and `agent-loop.mjs` state are modeled as fallback/headless adapter state, not primary runner state, unless registry explicitly selects fallback mode.
- Closeout/finalizer reads board before terminal decisions.
- Staged overlay manifest lists every proposed `.claude` target and its adoption owner.
