# Current Architecture

## Evidence Summary

| Evidence Path | Observation | Confidence |
|---|---|---|
| src/approval-service.js | Approval request submission and reviewer decision are implemented as application service functions. | high |
| src/audit-log.js | Audit events are stored through an append-only helper boundary. | high |
| tests/approval-flow.test.js | Runtime contract covers submission, decision, and audit note behavior. | high |

## Owned Paths

| Path | Responsibility | Change Policy |
|---|---|---|
| src/audit-log.js | audit event append behavior | owned |
| tests/approval-flow.test.js | regression coverage | owned |

## Read-only Paths

| Path | Reason |
|---|---|
| src/approval-service.js | baseline request and decision API evidence |

## Staged Paths

| Path | Planned Change |
|---|---|
| docs/architecture/approval-audit.md | architecture handoff package |

## Runtime Flow

Current request submission stays compatible. Reviewer decisions call the audit-log helper after preserving the existing approval request shape.
