# Phase 03 Recovery Sample

## Purpose

This sample proves the resumable session layer can describe:

- an interrupted run
- a resumed run with a new `run_id`
- a retry after a warning
- the exact next artifact and next action for the next worker

## Suggested Reading Order

1. `task_state.json`
2. `session_events.jsonl`
3. `decision_log.jsonl`
4. `artifact_links.json`

If the sample is understandable in that order without chat replay, the phase-03 recovery goal is satisfied.
