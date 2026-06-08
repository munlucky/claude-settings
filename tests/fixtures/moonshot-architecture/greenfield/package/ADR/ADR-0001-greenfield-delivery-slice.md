# ADR-0001: Greenfield approval delivery slice

## Status

Accepted

## Context

REQ-001 and REQ-002 require a PRD-only architecture package that can become an implementation plan without Brownfield evidence. ASR-001 emphasizes request correctness and ASR-002 emphasizes reviewer auditability.

## Decision

Use OPT-001: modular service command handlers with a repository port and an audit event record.

## Consequences

- TASK-001 can implement request submission behind a command boundary.
- TASK-002 can implement reviewer decisions with immutable audit notes.
- Brownfield current architecture recovery is not required for this greenfield package.

## Rejected Alternatives

| Alternative | Reason Rejected |
|---|---|
| OPT-002 CRUD-first direct table access | Weak audit boundary and weaker verification signal. |
