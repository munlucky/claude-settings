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
Validate that a web app is reachable and working at runtime after implementation.

## Prerequisites
- Running local dev server or staging URL
- Optional E2E command configured in project (for example `npm run test:e2e`)

## Usage
```bash
/browser-verifier --url=http://localhost:3000
/browser-verifier --url=https://staging.example.com --e2e="npm run test:e2e"
```

## Execution
1. Resolve target URL from `--url` or `APP_BASE_URL` (default: `http://localhost:3000`).
2. Run `.claude/agents/verification/verify-runtime.sh` with URL and optional E2E command.
3. If runtime check fails, stop and report environment readiness issue.
4. If E2E fails, return failure details and failing command.

## Output Contract
- pass/fail status
- target URL and HTTP response summary
- optional E2E result
- next actions (restart server, fix route, rerun tests)

## Script
```bash
.claude/agents/verification/verify-runtime.sh --url=<url> [--e2e="<command>"]
```
