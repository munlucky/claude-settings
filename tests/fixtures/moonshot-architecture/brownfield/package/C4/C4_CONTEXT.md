# C4 Context

## System Boundary

The existing approval fixture exposes approval request submission and reviewer decisions.

```mermaid
flowchart LR
  User[User] --> Approval[Approval Fixture]
  Reviewer[Reviewer] --> Approval
```

Requirement link: REQ-101.
