# Architecture Options

| Option ID | Summary | Requirement IDs | Verification Signal |
|---|---|---|---|
| OPT-001 | Modular service with command handlers, repository port, and audit event record. | REQ-001, REQ-002 | request and reviewer contract tests pass |
| OPT-002 | CRUD-first service with direct table access from handlers. | REQ-001, REQ-002 | rejected due weak audit boundary |

## Recommendation

Select OPT-001 because it keeps approval commands explicit and gives ADR-0001 a narrow implementation slice.
