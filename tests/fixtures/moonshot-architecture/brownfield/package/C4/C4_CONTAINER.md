# C4 Container

## Containers

```mermaid
flowchart LR
  Service[approval-service.js] --> Audit[audit-log.js]
  Test[approval-flow.test.js] --> Service
```

ASR link: ASR-101.
