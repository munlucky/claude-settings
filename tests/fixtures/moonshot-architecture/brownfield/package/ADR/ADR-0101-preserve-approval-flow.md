# ADR-0101: Preserve approval flow while hardening audit notes

## Status

Accepted

## Context

REQ-101 and ASR-101 require reviewer audit note preservation without breaking the existing approval request API evidenced by `src/approval-service.js`.

## Decision

Use OPT-101: keep `approval-service.js` as the application boundary and harden `audit-log.js` plus regression coverage.

## Consequences

- TASK-101 can focus on owned audit and test paths.
- `src/approval-service.js` remains read-only baseline evidence unless a later plan explicitly changes the API.

## Rejected Alternatives

| Alternative | Reason Rejected |
|---|---|
| Rewrite approval-service first | Too much compatibility risk before preserving existing behavior. |
