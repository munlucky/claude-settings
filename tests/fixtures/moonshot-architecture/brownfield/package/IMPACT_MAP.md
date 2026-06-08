# Impact Map

## Change Impact

| Path | Current Responsibility | Proposed Change | Risk | Verification Signal |
|---|---|---|---|---|
| src/audit-log.js | append audit event | preserve note in audit event contract | low | approval audit regression test passes |
| tests/approval-flow.test.js | fixture regression | assert reviewer note remains persisted | low | approval audit regression test passes |

## Compatibility Impact

`submitApprovalRequest` input and output remain unchanged.

## Migration Strategy

Additive audit note contract only. No data migration is required for the fixture.
