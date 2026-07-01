# ASR Catalog

| ASR ID | Requirement IDs | Quality Scenario IDs | Architecture Significant Requirement | Rationale |
|---|---|---|---|---|
| ASR-001 | REQ-001, REQ-002 | QAS-001 | The repository must keep canonical source and profile/runtime output as separate architectural boundaries. | Prevents duplicate source authority and profile-local drift. |
| ASR-002 | REQ-004 | QAS-002 | Architecture context must expose compact prompt-facing authority and status metadata only. | Prevents unsafe raw MemoryGraph/KG/ontology/log/secret leakage. |
| ASR-003 | REQ-003, REQ-005 | QAS-003 | Runtime completion authority must remain event/evidence backed and separate from plan document presence. | Prevents false completion claims in long-running harness workflows. |
| ASR-004 | REQ-006 | QAS-004 | Harness changes need a quantitative regression path in addition to source tests. | Enables compare/promote/rollback decisions for harness behavior. |
