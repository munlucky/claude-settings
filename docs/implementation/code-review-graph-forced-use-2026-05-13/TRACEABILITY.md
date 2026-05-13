# Traceability

| Req ID | AC ID | Source | Requirement Summary | Phase | Plan File | Status |
|---|---|---|---|---|---|---|
| REQ-01 | AC-01 | User review loop | Single suffix source prevents drift. | 01 | `01-contract-schema-and-policy-sync-v1.md` | Planned |
| REQ-02 | AC-02, AC-03 | User review loop | Force actual CRG use, not string presence. | 02, 03, 04 | `02-cli-adapter-and-graph-state-v1.md`, `03-validator-parity-and-resolver-v1.md`, `04-bounded-phase-closeout-gates-v1.md` | Planned |
| REQ-03 | AC-04 | Current repo state | Empty graph must not count as ready. | 02 | `02-cli-adapter-and-graph-state-v1.md` | Planned |
| REQ-04 | AC-05 | v10/v11 review | Node/Python validator parity is required. | 03 | `03-validator-parity-and-resolver-v1.md` | Planned |
| REQ-05 | AC-06, AC-13 | Reviewer Agent | QA parser/writer must be shared and stable. | 01, 04 | `01-contract-schema-and-policy-sync-v1.md`, `04-bounded-phase-closeout-gates-v1.md` | Planned |
| REQ-06 | AC-07 | Reviewer Agent | Plan-level closeout and parity fixtures must enforce CRG evidence. | 05 | `05-fixtures-parity-and-readiness-v1.md` | Planned |
| REQ-07 | AC-08 | User constraint | Do not disturb current work session while creating docs. | 05 | `05-fixtures-parity-and-readiness-v1.md` | Planned |
| REQ-08 | AC-09 | Latest ENG review | Node YAML dependency strategy must be explicit. | 01 | `01-contract-schema-and-policy-sync-v1.md` | Planned |
| REQ-09 | AC-12, AC-14 | Latest ENG review | Artifact path and digest cross-check must be safe. | 03 | `03-validator-parity-and-resolver-v1.md` | Planned |
| REQ-10 | AC-11 | Latest ENG review | Artifact and carrier writes must be atomic. | 02 | `02-cli-adapter-and-graph-state-v1.md` | Planned |

