---
name: browser-verifier
description: Runs runtime/browser verification for web projects using URL health checks and optional E2E commands.
triggers:
  - "browser verify"
  - "runtime verify"
  - "verify ui"
  - "browser-verifier"
---

# Browser Verifier

## Role
Validate that a web app is reachable and working at runtime after implementation, with optional browser-flow checks layered on top of the existing URL/E2E harness.

## Prerequisites
- Running local dev server or staging URL
- Optional E2E command configured in project
- Recommended npm scripts:
  - `test:e2e:agent-browser` (preferred for feature-flow checks)
  - `test:e2e` (fallback / existing runner)

## Usage
```bash
/browser-verifier --url=http://localhost:3000
/browser-verifier --url=http://localhost:3000                         # default browser-flow=smoke + auto-detect E2E script
/browser-verifier --url=http://localhost:3000 --no-auto-e2e           # URL only
/browser-verifier --url=http://localhost:3000 --browser-flow=smoke
/browser-verifier --url=http://localhost:3000 --browser-flow=smoke --browser-only
/browser-verifier --url=https://staging.example.com --e2e="npm run test:e2e:agent-browser"
/browser-verifier --url=https://staging.example.com --e2e="npm run test:e2e"
```

## Runtime Adapter Policy

- `claude-code`: execute runtime checks through Claude tool routing.
- `codex`: execute the same runtime checks directly in the current Codex session.
- In both runtimes, use `.claude/agents/verification/verify-runtime.sh` as the canonical verifier.

## Execution
1. Resolve target URL from `--url` or `APP_BASE_URL` (default: `http://localhost:3000`).
2. If `--browser-flow` is set, ask the harness to attempt a browser-based flow using `browserctl` on `PATH` or `.claude/bin/browserctl`.
3. If browser runtime is available and the caller did not explicitly choose another flow, treat `smoke` as the default browser-flow for the standard verification path.
4. Run `.claude/agents/verification/verify-runtime.sh` with URL and optional browser-flow/E2E arguments (tool-routed in Claude runtime, direct shell in Codex runtime).
5. If `--e2e` is omitted, the script auto-detects npm scripts in this order:
   - `test:e2e:agent-browser`
   - `test:e2e`
6. If browser runtime is unavailable and browser-only mode was not requested, return a setup-gap warning and continue through the existing URL/E2E path.
7. If runtime check fails, stop and report environment readiness issue.
8. If browser flow or E2E fails, return failure details and the failing mode.

## Output Contract
- pass/fail status
- target URL and HTTP response summary
- optional browser-flow status
- optional E2E result
- next actions (restart server, fix route, rerun tests)

## Script
```bash
.claude/agents/verification/verify-runtime.sh --url=<url> [--browser-flow=<name>] [--browser-only] [--browserctl=<path>] [--e2e="<command>"] [--no-auto-e2e]
```
