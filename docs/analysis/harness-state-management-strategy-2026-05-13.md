# Harness State Management Strategy

Date: 2026-05-13
Status: simplified strategy proposal
Scope: Moonshot phase-runner, agent-loop, worker attempts, verification, closeout, human session display

## Decision

Use an Ouroboros-style simple state board first.

Do not start with a full event-sourced control plane, broad SQLite schema, or projector rewrite. The immediate fix is to reduce the number of concepts the runner has to reconcile.

```text
One state board
+ one transition helper
+ three terminal guards
+ existing artifacts remain evidence
```

## Why Simplify

The recurring failure is not that the harness lacks enough state infrastructure. It has too many semi-authoritative state surfaces:

- `phase-status.yaml`
- `current-run.json`
- `active-phase-run.json`
- `latest-dispatch.json`
- `SCORECARD.md`
- `QA_REPORT.md`
- verification verdict JSON
- SQLite runtime state

Adding a large new state architecture before reducing authority would make the system harder to reason about. The fix should first make state boring.

## Minimal Model

Create one compact current-state document for the active run:

```text
.claude/logs/workflow-enforcement/STATE.md
```

Suggested shape:

```md
# Run State

run: code-review-graph-forced-use-2026-05-13
status: blocked
phase: 04
attempt: 019e21a2-1ff4-7dd0-8c6a-c4bf598fc86b
owner: phase-runner
updated: 2026-05-13T...

## Now

Phase 4 is blocked.

## Reason

scorecard-verdict=blocked

## Next

Do not spawn another equivalent remediation worker.
Resume only after blocker evidence changes.

## Evidence

- SCORECARD.md
- QA_REPORT.md
- verification-verdict-phase04-final.json
```

This is not a rich database. It is a shared current board. A person can read it, and scripts can parse the small header block.

## State Authority

Use this authority order:

```text
1. STATE.md header
2. terminal guard helper
3. existing detailed artifacts as evidence
```

Existing YAML/JSON files remain compatibility outputs:

```text
phase-status.yaml        compatibility display
active-phase-run.json    compatibility display
latest-dispatch.json     compatibility display
current-run.json         compatibility display
```

They should no longer be allowed to overrule `STATE.md` when it says `blocked` or `complete`.

## Transition Helper

Add one small helper, not a new platform:

```text
.claude/scripts/lib/simple-run-state.mjs
```

Required functions:

```text
readState()
writeState(nextState)
setActive(fields)
setBlocked(fields)
setComplete(fields)
assertCanTransition(previous, next)
```

Allowed statuses:

```text
active
blocked
complete
paused
cancelled
unknown
```

Allowed transitions:

```text
unknown -> active
active -> blocked
active -> complete
active -> paused
active -> cancelled
paused -> active
blocked -> active        only when attempt changes or blocker evidence changes
blocked -> complete      only via closeout finalizer
complete -> active       never
cancelled -> active      never
```

## Three Guards

These three guards address the actual repeated symptoms.

### 1. Terminal Cannot Downgrade

If `STATE.md` says `blocked`, `complete`, or `cancelled`, heartbeat/progress writers cannot set `active` or `running` for the same attempt.

### 2. Blocked Does Not Retry Itself

If stop reason is `scorecard-verdict=blocked`, the runner must stop with handoff. It cannot spawn an equivalent remediation worker unless the blocker class or attempt input changed.

### 3. Compatibility Files Must Be Scrubbed

When writing compatibility YAML/JSON:

- `active` must not preserve old `finalVerdict`.
- `blocked` must not preserve `childAlive: true`.
- `complete` must not preserve `activeExecutionStatus: active`.

## Human Display

The session conversation only needs this:

```text
상태: blocked
Phase: 04
원인: scorecard-verdict=blocked
다음: blocker evidence 변경 후 resume
마지막 갱신: 2026-05-13T...
```

Do not build a dashboard first. Do not introduce a TUI first. The chat-facing status card is enough.

## What To Keep From Other Harnesses

| Harness | Keep |
|---|---|
| Ouroboros | compact board, continuity notes, current-source inspection |
| Superpowers | parallel work only when no shared state |
| LangGraph | resume only from clean checkpoint boundaries |
| AutoGen | do not snapshot while running and call it consistent |
| CrewAI | checkpoint after completed task boundaries |
| GitHub MemoryOps | short-term state and long-term memory are different |
| Harness Agents | the controller owns execution state; workers are steps |

## What Not To Do Yet

Do not implement these in the first pass:

- full event sourcing
- broad SQLite migration
- new dashboard
- all-artifact regeneration
- custom query language
- new public runner command
- complete rewrite of `phase-status.yaml`

Those can come later if the simple board proves insufficient.

## First Patch Scope

Implement only:

1. `simple-run-state.mjs`
2. a `STATE.md` writer
3. terminal transition tests
4. retry classifier guard for `scorecard-verdict=blocked`
5. compatibility scrub when publishing `phase-status.yaml`, `active-phase-run.json`, and `latest-dispatch.json`

## Success Criteria

The fix is good enough when these are true:

```text
blocked + running cannot coexist for the same attempt
active + finalVerdict=complete cannot coexist
scorecard-verdict=blocked cannot spawn an equivalent worker
STATE.md is readable without opening JSON files
existing QA/SCORECARD/verdict artifacts remain available as evidence
```

## Final Rule

Keep the harness simple:

```text
One current board.
One transition helper.
Few statuses.
Terminal states are sticky.
Artifacts explain state; they do not own it.
```
