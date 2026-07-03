# ADR-0003: Import Before Daily

## Status

Accepted.

## Context

Target projects need a lightweight export format, while Moonshot Relay needs a project-scoped account-root namespace for analysis.

## Decision

Use a two-step flow:

```text
target project retro-outbox -> retro import -> account-root retro inbox -> daily/propose/issue-draft
```

## Consequences

- Project workspaces do not directly mutate Moonshot Relay source or profile state.
- Import can enforce schema validation, redaction, duplicate handling, and manifest output.
- Daily analysis runs against normalized inbox data.

