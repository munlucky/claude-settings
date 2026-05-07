# Harness Worker Overhead Scenario Matrix

| Scenario ID | Requirement | Phase | Status | Evidence | Verification Signal |
|---|---|---:|---|---|---|
| SCN-P01-1 | HWO-003 | 01 | pass | `01-phase-01-verdict-requiredchecks-contract-v1/QA_REPORT.md` | `--missing-check none` serializes to an empty missing array. |
| SCN-P01-2 | HWO-003 | 01 | pass | `01-phase-01-verdict-requiredchecks-contract-v1/QA_REPORT.md` | Real missing checks still produce `missingRequiredChecks`. |
| SCN-P01-3 | HWO-003 | 01 | pass | `01-phase-01-verdict-requiredchecks-contract-v1/QA_REPORT.md` | Placeholder expected/passed checks fail before writing a misleading verdict. |
| SCN-P02-1 | HWO-004 | 02 | pass | `02-phase-02-failure-classifier-raw-runtime-taxonomy-v1/QA_REPORT.md` | MCP cleanup EPERM maps to `mcp_cleanup_eperm`. |
| SCN-P02-2 | HWO-007 | 02 | pass | `02-phase-02-failure-classifier-raw-runtime-taxonomy-v1/QA_REPORT.md` | Offline plugin/network strings classify without broad implementation retry. |
| SCN-P02-3 | HWO-007 | 02 | pass | `02-phase-02-failure-classifier-raw-runtime-taxonomy-v1/QA_REPORT.md` | PATH update denial maps to `path_update_denied`. |
| SCN-P03-1 | HWO-008 | 03 | pass | `03-phase-03-spawn-prompt-redaction-and-log-hygiene-v1/QA_REPORT.md` | Spawn event summary omits full prompt text. |
| SCN-P03-2 | HWO-008 | 03 | pass | `03-phase-03-spawn-prompt-redaction-and-log-hygiene-v1/QA_REPORT.md` | Prompt archive is hash-addressed and recoverable. |
| SCN-P03-3 | HWO-008 | 03 | pass | `03-phase-03-spawn-prompt-redaction-and-log-hygiene-v1/QA_REPORT.md` | Command metadata remains bounded through `argvHash` and `argvSummary`. |
| SCN-P04-1 | HWO-001 | 04 | pass | `04-phase-04-structured-artifact-writer-expansion-v1/QA_REPORT.md` | Writer-only artifact sync can complete closeout sections. |
| SCN-P04-2 | HWO-002 | 04 | pass | `04-phase-04-structured-artifact-writer-expansion-v1/QA_REPORT.md` | Repeated writer run is idempotent. |
| SCN-P04-3 | HWO-009 | 04 | pass | `04-phase-04-structured-artifact-writer-expansion-v1/QA_REPORT.md` | WORKSETS evidence, owned paths, and commands sync from structured state. |
| SCN-P05-1 | HWO-001 | 05 | pass | `05-phase-05-completion-gate-reason-taxonomy-and-retry-policy-v1/QA_REPORT.md` | Review closeout gaps classify as writer-only remediation. |
| SCN-P05-2 | HWO-009 | 05 | pass | `05-phase-05-completion-gate-reason-taxonomy-and-retry-policy-v1/QA_REPORT.md` | Missing real verification remains verification remediation, not clean finish. |
| SCN-P05-3 | HWO-012 | 05 | pass | `05-phase-05-completion-gate-reason-taxonomy-and-retry-policy-v1/QA_REPORT.md` | Environment blockers stop the loop instead of broad auto-fix. |
| SCN-P06-1 | HWO-005 | 06 | pass | `06-phase-06-runtime-unavailable-cache-and-memorygraph-policy-v1/QA_REPORT.md` | First unavailable MemoryGraph event records detail; repeat emits cached summary. |
| SCN-P06-2 | HWO-005 | 06 | pass | `06-phase-06-runtime-unavailable-cache-and-memorygraph-policy-v1/QA_REPORT.md` | Non-strict MemoryGraph unavailable is non-blocking. |
| SCN-P06-3 | HWO-007 | 06 | pass | `06-phase-06-runtime-unavailable-cache-and-memorygraph-policy-v1/QA_REPORT.md` | Repeated PATH/plugin unavailable fingerprints are summarized. |
| SCN-P07-1 | HWO-006 | 07 | pass | `07-phase-07-regression-fixture-and-documentation-sync-v1/QA_REPORT.md` | Codex base args include `--sandbox workspace-write` and exclude `--full-auto`. |
| SCN-P07-2 | HWO-001-HWO-009 | 07 | pass | `SCENARIO_MATRIX.md` | Every HWO overhead class has scenario evidence or an explicit mapped phase. |
| SCN-P07-3 | HWO-012 | 07 | pass | `07-phase-07-regression-fixture-and-documentation-sync-v1/QA_REPORT.md` | Knowledge repository audit exits 0 after package updates. |

## Matrix Verdict

- Scenario coverage: pass
- Verified SCN-* coverage: SCN-P01-1 through SCN-P07-3
- Remaining uncovered scenarios: none
