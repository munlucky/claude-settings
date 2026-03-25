---
name: qa-flow
description: Run a guided browser-based QA flow against a local or staging URL using the persistent browser runtime when available.
triggers:
  - "qa flow"
  - "browser qa"
  - "flow verify"
  - "guided qa"
---

# QA Flow

## Role

Verify a user-facing flow in a real browser session and return a compact pass/fail report.

## Status

This skill is currently a scaffold. It prepares the interface for integrating persistent browser flows into the existing verification harness.

## Inputs

- target URL
- optional flow name such as `smoke`, `auth`, `checkout`, or `dashboard`
- optional auth/setup notes

## Intended Runtime Path

Primary path:

- `.claude/bin/browserctl`

Fallback path:

- `.claude/skills/browser-verifier/SKILL.md`
- `.claude/agents/verification/verify-runtime.sh`

## Usage

```bash
/qa-flow --url=http://localhost:3000 --flow=smoke
/qa-flow --url=https://staging.example.com --flow=auth
/qa-flow --url=http://localhost:3000 --flow=dashboard --notes="requires seeded admin user"
```

## Planned Workflow

1. Validate the target URL.
2. Start or reuse the persistent browser session.
3. Navigate to the page and collect an initial snapshot.
4. Execute flow-specific steps.
5. Capture failures with screenshots or log excerpts when possible.
6. Return a pass/fail summary with concrete next actions.

## Flow Contract

Each flow should eventually define:

- entry URL
- prerequisite state
- expected visible markers
- critical interactions
- pass/fail conditions

## Output Contract

- flow name
- target URL
- runtime used
- pass/fail status
- issues found
- suggested fixes or follow-up checks

## Failure Policy

- If browser runtime is missing, report setup gap and recommend the current `browser-verifier` fallback.
- If a flow is not yet implemented, report that explicitly instead of running partial checks silently.
