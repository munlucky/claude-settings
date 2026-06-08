# C4 Container

## Containers

```mermaid
flowchart LR
  API[HTTP API] --> App[Approval Application Service]
  App --> DB[(Approval Store)]
  App --> Audit[(Audit Event Log)]
```

ASR links: ASR-001, ASR-002.
