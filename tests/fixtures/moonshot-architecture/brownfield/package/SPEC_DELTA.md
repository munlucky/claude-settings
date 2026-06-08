# Spec Delta

## Current Evidence

The current approval flow is evidenced by `src/approval-service.js`, `src/audit-log.js`, and `tests/approval-flow.test.js`.

## Proposed Delta

| Delta ID | Requirement IDs | Existing Spec | Proposed Spec | Compatibility |
|---|---|---|---|---|
| DELTA-101 | REQ-101 | reviewer decision stores reviewer and decision | reviewer decision also preserves audit note | backward compatible |

## Migration Notes

Rollback: revert audit note assertion and preserve the existing reviewer decision flow.
