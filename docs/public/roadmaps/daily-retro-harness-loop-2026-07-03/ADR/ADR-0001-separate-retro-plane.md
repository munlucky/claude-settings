# ADR-0001: Separate Retro Plane

## Status

Accepted.

## Context

Moonshot Relay already has `tools/harness-lab/harness-history.mjs` for lab run history. The new retro workflow reads task closeout summaries, not lab candidate run records.

## Decision

Implement retro as `tools/retro/**` with its own schemas, templates, fixtures, and CLI routing.

## Consequences

- Existing harness history behavior remains stable.
- Retro can evolve its task-oriented schema without overloading lab history.
- Shared redaction helpers may be extracted later after both contracts stabilize.

