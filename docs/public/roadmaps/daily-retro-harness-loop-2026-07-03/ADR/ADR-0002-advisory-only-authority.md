# ADR-0002: Advisory-Only Authority

## Status

Accepted.

## Context

Retro output summarizes closeout evidence and can be mistaken for completion authority.

## Decision

Every retro JSON output and proposal artifact must declare advisory status with `promotionAuthority: false`.

## Consequences

- Retro cannot promote, close, or score work.
- Schema tests can block accidental authority escalation.
- Human-approved implementation remains separate from retrospective analysis.

