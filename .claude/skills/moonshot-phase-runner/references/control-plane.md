# Phase Runner Control Plane

- `phase-status.yaml` is the human-audit state authority for active phase, completed phases, and next actionable phase.
- The current session owns phase selection, evidence collection, review integration, and finalizer invocation.
- Root phase docs are discovered non-recursively from the selected plan directory. Archived docs under `close/` are history.
- Stale `current-run.json`, `active-phase-run.json`, or `latest-dispatch.json` can warn, but must not override `phase-status.yaml`.
- Parent evidence collection must include changed files, deterministic command output, reviewer findings, scorecard status, and verifier verdict.
