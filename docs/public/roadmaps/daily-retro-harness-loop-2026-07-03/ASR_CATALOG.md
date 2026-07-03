# ASR Catalog

## ASRs

| ID | Requirement | Quality Attribute | Scenario | Verification Signal |
|---|---|---|---|---|
| ASR-001 | Retro outputs are advisory only. | Safety | Any retro command output includes `promotionAuthority: false` and cannot be consumed as closeout authority. | schema tests and no-promotion contract test |
| ASR-002 | Runtime state stays outside source payloads. | Maintainability | Generated retro inbox, daily reports, candidates, proposals, and issue drafts are written under runtime state unless explicitly fixture/test data. | package layout/materialization tests and docs check |
| ASR-003 | Collect records are compact and redacted. | Security | Import rejects secret-like strings and raw logs/transcripts; collect records keep evidence paths/hashes and summaries. | redaction contract test |
| ASR-004 | Pattern extraction avoids over-generalization. | Correctness | Improvement candidates require repeated failure classes, explicit contract violation, source/template evidence, or a project-neutral failing test. | daily/proposer tests with isolated and repeated failures |
| ASR-005 | CLI integration follows existing dispatch style. | Operability | `node bin/moonshot-relay.mjs retro --help` routes to a source command without changing install/bridge/delivery behavior. | CLI contract test |
| ASR-006 | Daily reports are deterministic. | Testability | Same collect input set produces stable pattern IDs and candidate IDs. | fixture-based daily and proposer tests |
| ASR-007 | GitHub writes are not automatic. | Safety | Issue support renders drafts only in this plan; later API creation requires explicit approval and duplicate fingerprinting. | issue-draft contract test |
| ASR-008 | Harness-history remains separate. | Evolvability | Retro can reuse safety helpers later but does not mutate lab history/index/frontier contracts in the initial implementation. | traceability and path ownership review |

## Quality Attribute Scenarios

| Scenario ID | Stimulus | Response | Measure |
|---|---|---|---|
| QAS-001 | A collect record contains `token=` or a private-key marker. | Import fails before writing inbox output. | test asserts rejected count and no copied file. |
| QAS-002 | Three tasks share `acceptance_mapping_missing`. | Daily report emits one repeated failure class and one improvement candidate. | deterministic ID and affected task list match fixture. |
| QAS-003 | One task has a project-specific failure only. | Daily report records it but proposer does not create a harness patch candidate. | candidate count remains zero or low-priority watch item only. |
| QAS-004 | Operator runs `moonshot-relay retro issue-draft`. | Local markdown/body JSON is generated; no GitHub API write occurs. | tests mock absence of network writes and validate fingerprint metadata. |
| QAS-005 | Package materialization runs. | Runtime retro output directories are not included as source payload. | package layout test excludes generated retro roots. |

