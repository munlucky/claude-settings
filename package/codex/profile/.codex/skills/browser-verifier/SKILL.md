---
name: browser-verifier
description: Runs runtime/browser verification for web projects using URL health checks and optional E2E commands.
surfaceStatus: optional_bundle_member
context: fork
triggers:
  - "browser verify"
  - "runtime verify"
  - "verify ui"
  - "browser-verifier"
---

# Browser Verifier

## Visibility

This is a verification helper for runtime and browser checks.
Prefer running it behind the verification flow unless the user explicitly requests browser verification.
When used as a read-only verifier, prefer a forked verification session and return only the structured verdict needed by the caller.

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

- `claude-code`: execute runtime checks through Claude tool routing while preserving forked verifier semantics.
- `codex`: prefer a fresh forked verification session or equivalent isolated attempt; keep the main session as coordinator and merge back summary results only.
- If the active runtime cannot preserve isolated verifier execution, degrade explicitly to current-session execution and record that isolation was degraded.
- In both runtimes, use `.claude/agents/verification/verify-runtime.sh` as the canonical verifier.

## Execution
1. Resolve target URL from `--url` or `APP_BASE_URL` (default: `http://localhost:3000`).
2. If `--browser-flow` is set, ask the harness to run `.claude/scripts/browser-flow-runner.mjs` using `browserctl` on `PATH` or `.claude/bin/browserctl`.
3. If browser runtime is available and the caller did not explicitly choose another flow, treat `smoke` as the default browser-flow for the standard verification path.
4. Run `.claude/agents/verification/verify-runtime.sh` with URL and optional browser-flow/E2E arguments from the isolated verifier boundary when available.
5. If `--e2e` is omitted, the script auto-detects npm scripts in this order:
   - `test:e2e:agent-browser`
   - `test:e2e`
6. Classify runtime evidence depth:
   - `smoke`: URL reachable, page loaded, or a shallow browser smoke check ran.
   - `open-act-mutate-persist-recover`: a critical scenario opened the flow, acted, changed state, persisted it, and recovered/re-entered successfully.
7. Treat smoke-only evidence for critical `SCN-*` as `warning`; it cannot support clean finish by itself.
8. If browser runtime is unavailable and browser-only mode was not requested, return a setup-gap warning and continue through the existing URL/E2E path.
9. If runtime check fails, stop and report environment readiness issue.
10. If browser flow or E2E fails, return failure details and the failing mode.

## Output Contract
- pass/fail status
- target URL and HTTP response summary
- optional browser-flow status
- optional browser-flow verdict file at `.claude/browser-flow-verdict-<runId>.json`
- optional E2E result
- runtime evidence depth: `smoke`, `open-act`, or `open-act-mutate-persist-recover`
- critical scenario smoke-only warnings
- next actions (restart server, fix route, rerun tests)
- structured summary suitable for merge-back into the caller session

## Browser Flow Artifacts
- Runner verdicts are written to `.claude/browser-flow-verdict-<runId>.json`.
- Screenshots, console events, and network events are written under `.claude/browser-artifacts/` when the flow requests those artifacts.
- Missing browser runtime or missing flow declarations should produce a setup-gap verdict instead of a hand-written pass.
- Critical `SCN-*` flows need interaction evidence beyond smoke before clean finish.

## Script
```bash
.claude/agents/verification/verify-runtime.sh --url=<url> [--browser-flow=<name>] [--browser-only] [--browserctl=<path>] [--e2e="<command>"] [--no-auto-e2e]
```
