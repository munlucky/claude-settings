# C4 Component

## Components

| Component | Container | Responsibility | Requirement IDs |
|---|---|---|---|
| submitApprovalRequest | approval-service.js | preserve current request API | REQ-101 |
| recordReviewerDecision | approval-service.js | call audit logging while returning decided request | REQ-101 |
| appendAuditEvent | audit-log.js | append reviewer audit note | REQ-101 |
