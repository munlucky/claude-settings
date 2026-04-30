---
name: qa-flow
description: Run a guided browser-based QA flow against a local or staging URL using the persistent browser runtime when available.
surfaceStatus: optional_bundle_member
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

This skill is an optional verification-bundle member.
It can run browser smoke checks when a target URL is available, or run a conversational QA triage path when the user reports issues.
It is not part of the default verification chain unless a workflow explicitly selects guided browser QA.

## Inputs

- target URL
- optional flow name such as `smoke`, `auth`, `checkout`, or `dashboard`
- optional auth/setup notes
- optional user-reported issue or QA notes
- optional GitHub issue export intent

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

## Workflow

1. Validate the target URL.
2. Start or reuse the persistent browser session.
3. Navigate to the page and collect an initial snapshot.
4. Execute flow-specific steps.
5. For critical `SCN-*`, prefer the full depth path: open -> act -> mutate -> persist -> recover.
6. Capture failures with screenshots or log excerpts when possible.
7. Return a pass/fail/warn summary with concrete next actions.

## Conversational QA Triage

When the user is reporting bugs instead of asking for a browser smoke run:

1. Ask at most 2-3 short clarification questions only if expected behavior, actual behavior, or reproduction steps are missing.
2. Explore relevant project docs and domain terms in the background when available.
3. Decide whether the report is one issue or several independently fixable issues.
4. Produce durable issue drafts focused on user-visible behavior.
5. If GitHub export is explicitly requested and the GitHub tool/CLI is available, create issues in dependency order and return URLs.

Issue drafts must:

- use project domain language
- describe expected vs actual behavior
- include reproduction steps
- avoid file paths and line numbers unless the user asks for tactical implementation notes
- include AFK/HITL classification when agent handoff is expected
- include a TDD fix-plan outline for confirmed bugs

## Flow Contract

Each flow should eventually define:

- entry URL
- prerequisite state
- expected visible markers
- critical interactions
- runtime evidence depth: `smoke` or `open-act-mutate-persist-recover`
- pass/fail conditions

## Output Contract

- flow name
- target URL
- runtime used
- pass/fail status
- runtime evidence depth
- critical scenario smoke-only warnings
- issues found
- suggested fixes or follow-up checks
- issue drafts or issue URLs when QA triage is requested
- evidence paths such as screenshots, console excerpts, or QA report updates when available

## Failure Policy

- If browser runtime is missing, report setup gap and recommend the current `browser-verifier` fallback.
- If a flow is not yet implemented, report that explicitly instead of running partial checks silently.
- If a critical scenario only has smoke/page-load evidence, return `warn` and block clean-finish wording until deep interaction evidence exists.
- If reproduction steps are missing, do not invent them; ask a targeted question or mark the issue draft as blocked on reproduction.
