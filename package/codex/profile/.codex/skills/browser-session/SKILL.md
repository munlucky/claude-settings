---
name: browser-session
description: Manage and use a persistent local browser session for interactive runtime inspection and manual QA flows.
triggers:
  - "browser session"
  - "open browser session"
  - "interactive browser"
  - "persistent browser"
---

# Browser Session

## Role

Provide a Codex-native interactive browser session backed by a persistent local runtime.

## Status

This skill is currently a scaffold. It defines the contract and expected workflow for the upcoming browser runtime.

## Intended Tooling

- control wrapper: `browserctl` on `PATH` or `.claude/bin/browserctl`
- future daemon root: `.claude/tools/browserd/`

## Usage

```bash
/browser-session --url=http://localhost:3000
/browser-session --url=https://staging.example.com --snapshot
/browser-session --url=http://localhost:3000 --screenshot=.claude/artifacts/home.png
```

## Planned Workflow

1. Confirm `browserctl` exists on `PATH` or at `.claude/bin/browserctl`.
2. Start or reuse the browser daemon.
3. Navigate to the target URL.
4. Optionally run `snapshot`, `screenshot`, `console`, or `network`.
5. Return concise findings and next actions.

## Fallback Policy

- If `browserctl` is unavailable, stop and report that the browser runtime is not installed yet.
- Do not silently pretend browser interaction succeeded.
- When appropriate, recommend `browser-verifier` as the current fallback path.

## Output Contract

- target URL
- runtime status
- actions attempted
- artifacts produced
- blockers or setup gaps

## Planned Commands

```bash
browserctl start
browserctl goto <url>
browserctl snapshot
browserctl screenshot [path]
browserctl console
browserctl network
```
