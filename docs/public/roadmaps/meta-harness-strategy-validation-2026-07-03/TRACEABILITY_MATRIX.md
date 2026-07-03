# Traceability Matrix

| Requirement | ASR | Owner Candidate | Verification Signal | Status |
|---|---|---|---|---|
| REQ-001 Experience index | ASR-001, ASR-002, ASR-003 | `tools/harness-lab/harness-history.mjs` | generated read-model schema test; package exclusion test | scaled accepted |
| REQ-002 History CLI | ASR-003 | `tools/harness-lab/harness-history.mjs` | CLI JSON contract tests | accepted |
| REQ-003 Proposal artifact | ASR-001, ASR-003, ASR-008 | `tools/harness-lab/harness-loop.mjs` | `lab:evolve` contract test with parent immutability | accepted |
| REQ-004 Search fixtures | ASR-004, ASR-007 | `tests/fixtures/harness-search-fixtures/**`, `tools/evals/**` | deterministic fixture scorer and fixture identity tests | accepted |
| REQ-005 Environment snapshot | ASR-002, ASR-005 | `tools/harness-lab/harness-loop.mjs`, possible `scripts/lib` helper | redaction and fail-soft snapshot tests | accepted |
| REQ-006 Advisory frontier | ASR-001, ASR-006 | `tools/harness-lab/harness-history.mjs` | frontier output has `promotionAuthority: false` | staged |
| REJ-001 Direct import | ASR-001, ASR-002 | none | no upstream files copied | rejected |
| REJ-002 Autonomous mutation | ASR-001, ASR-002 | later phase only | no source-mutating proposer in this package | rejected for now |
| REJ-003 Proposal/frontier as promotion authority | ASR-001, ASR-006, ASR-008 | none | proposal/frontier outputs always include `promotionAuthority: false`; closeout remains H0-bound | rejected |
| REJ-004 Raw transcripts in canonical source | ASR-002, ASR-005 | none | package/layout tests and redaction tests block raw logs, transcripts, MemoryGraph/KG dumps, and secret-like values | rejected |
