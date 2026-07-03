# ADR-0002: Add Fail-Soft Environment Snapshot

## Status

Accepted.

## Context

The Meta-Harness TerminalBench-2 discovered harness included an environment bootstrap that reduced early probing on tasks where installed tools and files were non-obvious.

## Decision

Add a redacted environment snapshot as generated run evidence. Snapshot collection should be fail-soft: collection warnings are recorded, but normal candidate execution should not fail unless redaction or schema validation fails.

## Consequences

- Operators and proposal artifacts can reason from actual runtime conditions.
- Snapshot noise does not destabilize promotion gates.
- Redaction and package exclusion become mandatory tests.
