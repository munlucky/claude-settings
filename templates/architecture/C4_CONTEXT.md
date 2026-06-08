---
artifactId: C4_CONTEXT
schema: schemas/architecture/c4-model.schema.json
owner: "{{owner}}"
status: draft
---

# C4 Context

## Output Path Contract

When materialized into an architecture package, write this artifact to `C4/C4_CONTEXT.md`.

## System Boundary

Describe the system boundary and external actors.

## People And External Systems

| Name | Type | Relationship | Requirement IDs |
|---|---|---|---|
|  | person/system |  | REQ-001 |

## Context Diagram Source

```mermaid
flowchart LR
  User[User] --> System[Target System]
```
