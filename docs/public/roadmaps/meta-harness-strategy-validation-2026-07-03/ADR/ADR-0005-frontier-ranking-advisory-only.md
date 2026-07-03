# ADR-0005: Keep Frontier Ranking Advisory

## Status

Accepted.

## Context

The Meta-Harness paper uses Pareto/frontier reasoning for multi-objective settings. Moonshot Relay already has strict no-regression and strict-improvement promotion policies.

## Decision

Add frontier ranking only as a report over existing comparable history. It may order candidates by score, runtime, stale artifacts, mutation breadth, or safety indicators, but it must include `promotionAuthority: false` and must not bypass H0 compare/promote/closeout gates.

## Consequences

- Operators can inspect multi-metric tradeoffs.
- Hard blockers and fixture identity gates remain prior to ranking.
- This feature is deferred until history/read-model data exists.
