# Browser Runtime Integration Specification

Last-Reviewed: 2026-03-23

## Summary

This specification introduces a persistent browser runtime as a new verification substrate for local skills. The implementation should preserve the current contract-driven harness while enabling interactive browser flows.

## Proposed Components

### 1. Browser Daemon

Path:

- `.claude/tools/browserd/`

Responsibility:

- launch and manage a long-lived headless Chromium instance
- keep tabs, cookies, and localStorage alive across commands
- expose localhost HTTP endpoints for browser actions
- expire automatically after idle timeout

Expected internal modules:

- `server.ts`
- `browser-manager.ts`
- `ref-store.ts`
- `commands.ts`
- `state.ts`

### 2. CLI Wrapper

Path:

- `.claude/bin/browserctl`

Responsibility:

- discover or start daemon
- read state file and auth token
- issue HTTP requests to daemon
- print plain-text responses for agent use

Primary commands:

- `start`
- `stop`
- `health`
- `goto <url>`
- `snapshot`
- `click <ref>`
- `type <ref> <text>`
- `screenshot [path]`
- `console`
- `network`

### 3. Skill Layer

New skills:

- `browser-session`
- `qa-flow`

Existing skill to extend:

- `browser-verifier`

### 4. Harness Integration

Existing script to extend:

- `.claude/agents/verification/verify-runtime.sh`

The script remains the canonical verdict writer. Browser flow checks become an optional pre-E2E or alternate verification phase.

## Runtime Model

### State File

Proposed path:

- `.claude/browser-runtime/state.json`

Suggested schema:

```json
{
  "pid": 12345,
  "port": 43129,
  "token": "uuid-or-random-token",
  "startedAt": "2026-03-23T12:00:00Z",
  "runtime": "node",
  "version": "dev"
}
```

### Security Model

- bind daemon to `127.0.0.1`
- require bearer token on action routes
- write state file with owner-only permissions where possible
- never log cookie values or secrets

### Ref Model

Refs should be stable only within the current DOM snapshot:

- `@e1`, `@e2` for ARIA/interactive elements
- future optional `@c1` namespace for cursor-interactive fallbacks

Lifecycle rules:

- refs are invalidated on navigation
- command handlers must fail fast on stale refs

## Integration With Existing Workflow

### `browser-session`

Purpose:

- direct interactive browser work during debugging or QA

Outputs:

- plain-text snapshot/action results
- optional screenshots/log summaries

### `qa-flow`

Purpose:

- run a guided browser flow against local/staging URLs

Inputs:

- URL
- optional flow name
- optional auth/setup instructions

Outputs:

- pass/fail
- user-visible issues
- suggested next fixes

### `browser-verifier`

New role:

- keep existing URL/E2E checks
- optionally invoke browser-flow verification when requested or configured

### `completion-verifier`

No contract change required. It should continue consuming verdict artifacts produced by `verify-runtime.sh`.

## Delivery Phases

### Phase 1

- create skill skeletons
- add `browserctl` stub
- write integration docs

### Phase 2

- implement daemon start/stop/health
- support `goto`, `snapshot`, `screenshot`

### Phase 3

- support ref resolution and actions
- wire browser flow mode into `browser-verifier`

### Phase 4

- add richer logs
- add scripted flow support
- add screenshots to verdict artifacts

## Failure Handling

- if daemon is unavailable and cannot start, return setup/readiness failure
- if browser runtime is absent, `browser-verifier` falls back to current URL/E2E path
- if a flow step fails, preserve current verdict semantics with an additional browser-flow status field

## Acceptance Criteria

1. `browser-session` can describe the browser runtime contract without ambiguity.
2. `qa-flow` can define a repeatable flow check contract.
3. `browser-verifier` can be extended without breaking current callers.
4. `verify-runtime.sh` can emit compatible verdicts with optional browser-flow metadata.
