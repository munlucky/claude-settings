# ADR-0004: Issue Draft Before Issue Create

## Status

Accepted.

## Context

The supplied plan includes GitHub Issue creation, but remote writes are high impact and can create noisy duplicate issues.

## Decision

The initial implementation adds only `retro issue-draft`. Real issue creation is deferred to a later explicit approval phase.

## Consequences

- Operators can inspect issue bodies before remote writes.
- Fingerprint metadata can stabilize before API integration.
- The implementation avoids new external service dependencies.

