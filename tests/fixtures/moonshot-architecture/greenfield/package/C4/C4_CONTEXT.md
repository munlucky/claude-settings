# C4 Context

## System Boundary

The Approval Workflow system accepts approval requests from users and reviewer decisions from reviewers.

```mermaid
flowchart LR
  User[User] --> App[Approval Workflow]
  Reviewer[Reviewer] --> App
```

Requirement links: REQ-001, REQ-002.
