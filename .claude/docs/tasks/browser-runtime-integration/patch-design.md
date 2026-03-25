# Browser Runtime Patch Design

Last-Reviewed: 2026-03-23

## Scope

This document describes the exact integration changes for:

- `.claude/skills/browser-verifier/SKILL.md`
- `.claude/agents/verification/verify-runtime.sh`

It is intentionally limited to patch planning. It does not claim that the browser daemon exists yet.

## Patch 1: Extend `browser-verifier`

File:

- `.claude/skills/browser-verifier/SKILL.md`

### Current Behavior

- run URL reachability
- auto-detect or accept E2E command
- call `verify-runtime.sh`

### Proposed Additions

Add optional arguments:

```bash
/browser-verifier --url=http://localhost:3000 --browser-flow=smoke
/browser-verifier --url=http://localhost:3000 --browser-flow=checkout
/browser-verifier --url=http://localhost:3000 --browser-only
```

Add execution policy:

1. If `--browser-flow` is set, prefer `browserctl` for interactive flow steps.
2. If `--browser-only` is set, skip external E2E command execution.
3. If `browserctl` is missing, report setup gap and fall back unless browser-only was explicitly requested.

### Minimal Text Changes

- update role from "URL health + optional E2E" to "runtime/browser verification"
- document the fallback hierarchy:
  - browser flow
  - E2E command
  - URL health check

## Patch 2: Extend `verify-runtime.sh`

File:

- `.claude/agents/verification/verify-runtime.sh`

### Current Inputs

- `--url`
- `--e2e`
- `--timeout`
- `--no-auto-e2e`

### Proposed Inputs

- `--browser-flow <name>`
- `--browser-only`
- `--browserctl <path>`

### Proposed New Variables

```bash
BROWSER_FLOW=""
BROWSER_ONLY=false
BROWSERCTL="${BROWSERCTL_PATH:-.claude/bin/browserctl}"
BROWSER_FLOW_STATUS="not_run"
```

### Proposed Flow

1. Run URL health check first.
2. If browser flow requested:
   - verify `browserctl` exists and is executable
   - run:
     - `browserctl start`
     - `browserctl goto "$URL"`
     - flow-specific commands
   - mark `BROWSER_FLOW_STATUS=passed|failed|skipped`
3. If `BROWSER_ONLY=false`, continue to E2E branch.
4. Write browser-flow status into verdict JSON.

### Proposed Verdict JSON Additions

Add fields under `checks`:

```json
{
  "browserFlow": "smoke",
  "browserFlowStatus": "passed",
  "browserOnly": false,
  "browserctlPath": ".claude/bin/browserctl"
}
```

### Exit Semantics

- URL failure: exit `1`
- browser flow failure: exit `2`
- E2E failure: exit `3`

If exit-code compatibility is critical, keep E2E as `2` and defer browser-flow failure to a later revision. That is the safer first rollout.

## Compatibility Recommendation

For the first real patch:

- keep existing exit codes
- keep current success/failure verdict strings
- add browser-flow metadata only
- treat browser-flow failure as `failed` with exit `2` only if no E2E ran

This reduces risk for `moonshot-orchestrator` and `completion-verifier`.

## Suggested Implementation Order

1. Update `browser-verifier` docs and accepted arguments
2. Add no-op browser-flow branches to `verify-runtime.sh`
3. Introduce working `browserctl start|health|goto`
4. Enable real browser flow execution
