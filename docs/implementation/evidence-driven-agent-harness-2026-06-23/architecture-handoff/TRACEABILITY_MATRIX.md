# Evidence-Driven Agent Harness Traceability Matrix

This matrix binds the source design requirements to the Phase 01 architecture contract and later implementation phases. It is intentionally compact and source-safe.

| Requirement | Contract Decision | Constraints | Phase | Verification Signal |
|---|---|---|---|---|
| EDAH-REQ-01 native authority, external harnesses as references only | EDAH-DEC-01 | EDAH-CON-01 | 01 | EDAH-VSIG-01 |
| EDAH-REQ-02 candidate/source-bound artifacts | EDAH-DEC-03, EDAH-DEC-05 | EDAH-CON-04 | 02 | EDAH-VSIG-05 |
| EDAH-REQ-03 contract/spec revision and invalidation | EDAH-DEC-03 | EDAH-CON-04 | 03 | EDAH-VSIG-05 |
| EDAH-REQ-04 fresh independent review bundles | EDAH-DEC-05 | EDAH-CON-04 | 04 | EDAH-VSIG-05 |
| EDAH-REQ-05 deterministic verify and policy score | EDAH-DEC-02, EDAH-DEC-05 | EDAH-CON-02, EDAH-CON-04 | 05 | EDAH-VSIG-05 |
| EDAH-REQ-06 workspace receipts, event ledger, resume | EDAH-DEC-02, EDAH-DEC-05 | EDAH-CON-02 | 06 | EDAH-VSIG-05 |
| EDAH-REQ-07 plan graph scheduler and scope drift | EDAH-DEC-03 | EDAH-CON-04 | 07 | EDAH-VSIG-02 |
| EDAH-REQ-08 delivery submit gate | EDAH-DEC-02, EDAH-DEC-05 | EDAH-CON-02, EDAH-CON-03 | 08 | EDAH-VSIG-05 |
| EDAH-REQ-09 project JSON artifacts into runtime-state authority | EDAH-DEC-02 | EDAH-CON-02 | 01, 05, 06 | EDAH-VSIG-05 |
| EDAH-REQ-10 skills doctor and package boundary | EDAH-DEC-03 | EDAH-CON-05 | 09 | EDAH-VSIG-05 |
| EDAH-REQ-11 optional plan canvas as derived UI | EDAH-DEC-03 | EDAH-CON-06 | 10 | EDAH-VSIG-05 |

## Phase Readiness

| Phase | Readiness After Phase 01 | Reason |
|---|---|---|
| 02 | Ready for source implementation | Candidate identity scope, paths, and evidence signals are selected. |
| 03 | Ready after 02 or with explicit dependency satisfaction evidence | Contract engine depends on candidate identity semantics. |
| 04 | Ready after 02 and 03 | Review lifecycle depends on candidate identity and contract revision. |
| 05 | Ready after 02 and 04 | Verification and score require candidate identity and review outcome contracts. |
| 06 | Ready after 02, 03, and 05 | Event and resume rules depend on receipt, contract, and verification projection semantics. |
| 07 | Ready after 03 and 06 | Scheduler needs contract and event/state compatibility. |
| 08 | Ready after 04, 05, 06, and 07 | Delivery gate must consume review, verify, score, event, and scope evidence. |
| 09 | Ready after 02 and 07 | Skills doctor uses candidate identity and plan graph boundary contracts. |
| 10 | Backlog unless explicitly pulled in | Optional derived UI; not needed for core harness authority. |
