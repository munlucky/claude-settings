# Browser Runtime Integration

Last-Reviewed: 2026-03-23

## Goal

Add a persistent browser runtime to the local Codex-oriented verification stack without importing gstack's full workflow model.

## Why This Exists

Current browser verification is centered on:

- URL reachability
- optional E2E command execution
- JSON verdict emission for orchestrator consumption

That is sufficient for environment readiness, but it does not provide:

- persistent browser sessions
- interactive DOM inspection
- ref-based element targeting
- browser-native debugging loops across multiple commands

## Current State

Relevant local components:

- `.claude/skills/browser-verifier/SKILL.md`
- `.claude/agents/verification/verify-runtime.sh`
- `.claude/skills/completion-verifier/SKILL.md`
- `.claude/skills/moonshot-orchestrator/SKILL.md`

Current runtime verification contract:

- HTTP reachability is checked with `curl`
- optional E2E command is executed with `bash -lc`
- results are emitted to `.claude/runtime-verdict-*.json`

## Target State

Add a browser runtime layer with these properties:

- long-lived local daemon
- localhost-only communication
- auth token in local state file
- persistent browser context for cookies, localStorage, and tabs
- CLI wrapper for snapshot/click/type/screenshot/logs
- verifier integration that can run flow checks before or alongside E2E

## Non-Goals

- replacing the existing Moonshot orchestration chain
- importing gstack telemetry, session tracking, or user-global state
- introducing roleplay-heavy CEO/designer workflow skills
- changing verification verdict schema in incompatible ways

## Design Constraints

1. Codex-native execution path must remain first-class.
2. Existing verification artifacts must stay readable by current orchestrators.
3. New browser tooling must degrade cleanly when Playwright/runtime setup is missing.
4. Documentation paths must remain under `.claude/docs/tasks/`.

## Working Assumptions

- The browser daemon can be implemented locally under `.claude/tools/browserd/`.
- A thin wrapper script can live at `.claude/bin/browserctl`.
- Browser flow verification should extend, not replace, `browser-verifier`.
- The first delivery can be scaffold-only as long as contracts and call sites are clear.

## Open Questions

- Whether the daemon should be Bun-first, Node-first, or dual-runtime
- Whether flow scripts should be declarative YAML/JSON or shell-driven
- Whether screenshots/logs should be stored under `.claude/artifacts/` or a new runtime directory

## Immediate Deliverables

1. Integration specification
2. `browser-session` skill skeleton
3. `qa-flow` skill skeleton
4. Patch design for `browser-verifier` and `verify-runtime.sh`
