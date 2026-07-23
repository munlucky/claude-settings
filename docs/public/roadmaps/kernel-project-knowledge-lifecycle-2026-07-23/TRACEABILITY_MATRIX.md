# Kernel Project Knowledge Lifecycle Traceability Matrix

## Requirements

| ID | Requirement | Design owner | Implementation surfaces | Verification signals | Phase |
|---|---|---|---|---|---|
| KKL-REQ-001 | Durable project identity must not depend only on cwd basename. | Project Identity | `scripts/kernel/project-identity.mjs` | remote/path alias collision tests | 01 |
| KKL-REQ-002 | Kernel knowledge state must be isolated from Relay runtime/state/profile. | Knowledge Boundary | `runtime-home`, project knowledge root | no-migration and contamination tests | 01, 02, 07 |
| KKL-REQ-003 | Knowledge records must be typed, provenance-bound, and transition validated. | Knowledge Contract | record schemas/store | invalid transition, evidence requirement tests | 01 |
| KKL-REQ-004 | Every non-trivial run must bind a project knowledge revision at FRAME. | Control Plane | `startRun`, `runs` columns | start revision/context receipt tests | 02 |
| KKL-REQ-005 | Stage context must load only stage/objective/path-relevant knowledge. | Retrieval | context loader/resolver | golden ranking and irrelevant exclusion tests | 02, 03 |
| KKL-REQ-006 | Raw graph, ontology dump, logs, transcripts, and secrets must not enter prompts. | Prompt Safety | renderer/redactor | prompt purity/fuzz tests | 02, 03 |
| KKL-REQ-007 | Architecture decisions and ontology constraints must be applied to affected paths. | Architecture/Ontology | architecture resolver/evaluator | blocking/ask-first/always matrix | 03 |
| KKL-REQ-008 | Single-run observations must not automatically become reusable tacit knowledge. | Tacit Lifecycle | tacit resolver | repetition/evidence/contradiction tests | 03, 04 |
| KKL-REQ-009 | Work results must first be recorded as run-bound candidates. | Candidate Lifecycle | candidate extractor/store | source/evidence binding tests | 04 |
| KKL-REQ-010 | Candidate verification must compare diff, acceptance, architecture, ontology, and fresh evidence. | Knowledge Review | candidate reviewer | stale/source mismatch/violation tests | 04 |
| KKL-REQ-011 | Verified project knowledge writes must require accepted Kernel completion. | Completion Gate | knowledge commit/control plane | pre-completion write rejection | 05 |
| KKL-REQ-012 | Knowledge updates must be atomic and revisioned. | Knowledge Store | transaction writer/revision manifest | crash/concurrency/fault tests | 05 |
| KKL-REQ-013 | Supersession must preserve history and reject cycles/cross-project overwrite. | Supersession | supersession log/validator | cycle/authority/cross-project tests | 05 |
| KKL-REQ-014 | Knowledge closeout must emit an immutable receipt with revision lineage. | Evidence | receipt/state projection | digest/tamper/lineage tests | 05 |
| KKL-REQ-015 | Git commit/push must run only after explicit request and knowledge closeout. | Git Closeout | `kernel-commit-closeout` | approval/precondition rejection tests | 06 |
| KKL-REQ-016 | Git staging must exclude runtime, knowledge state, generated bridges, secrets, and unrelated changes. | Staging Policy | staging policy adapter | denylist/mixed changes tests | 06 |
| KKL-REQ-017 | Push completion requires local/remote SHA parity. | Delivery Evidence | remote parity verifier | success/failure/mismatch tests | 06 |
| KKL-REQ-018 | Git closeout events and receipts must not become completion authority. | Authority Boundary | state event ledger/projection | completion decision invariance tests | 06 |
| KKL-REQ-019 | Package/profile surfaces must expose one public Kernel entrypoint and internal-only capabilities. | Packaging | catalog/manifest/profiles | surface parity and discovery tests | 07 |
| KKL-REQ-020 | Install/uninstall/rollback must preserve user knowledge by default and never damage Relay. | Adoption | installer/profile lifecycle | disposable-home rollback tests | 07 |

## Scenarios

| ID | Scenario | Expected outcome | Evidence | Phase |
|---|---|---|---|---|
| KKL-SCN-001 | First Kernel run with no configured knowledge | advisory context, accepted work, revision 1 knowledge commit | E2E receipt chain | 02, 05, 07 |
| KKL-SCN-002 | Existing blocking ontology constraint is violated | PROVE fails; no knowledge/Git commit | constraint verdict | 03, 04 |
| KKL-SCN-003 | Two runs commit against same start revision | first succeeds; second conflicts and re-reviews | concurrency receipts | 05 |
| KKL-SCN-004 | Candidate is based only on transcript/tool output | quarantined/rejected; not semantic | rejection reason | 04 |
| KKL-SCN-005 | User asks to close but not commit | knowledge closeout allowed; Git closeout skipped | skip receipt | 06 |
| KKL-SCN-006 | User explicitly requests commit only | scoped local commit; no push | commit receipt | 06 |
| KKL-SCN-007 | User explicitly requests commit and push | push plus local/remote parity matched | parity receipt | 06, 07 |
| KKL-SCN-008 | Runtime DB and `.env` are mixed with product changes | forbidden paths excluded/blocked | staging policy report | 06 |
| KKL-SCN-009 | Package uninstall is executed | Kernel-owned payload removed, project knowledge preserved, Relay unchanged | uninstall manifest | 07 |
| KKL-SCN-010 | Knowledge writer crashes before revision advance | no partial revision/record visibility | fault-injection evidence | 05 |

## Task Owner and Verification Mapping

| Workstream | Primary owner | Independent verifier | Required evidence |
|---|---|---|---|
| Identity and record contracts | Kernel knowledge maintainer | contract reviewer | schema and collision tests |
| Context loading and prompt safety | Kernel context maintainer | security reviewer | redaction/fuzz/token tests |
| Architecture/ontology retrieval | architecture knowledge maintainer | architecture reviewer | applicability/conflict fixtures |
| Candidate review | knowledge lifecycle maintainer | spec reviewer | candidate/evidence matrix |
| Knowledge commit/supersession | state authority maintainer | data-integrity reviewer | atomic/concurrency/tamper tests |
| Git closeout | Git operations maintainer | security/operations reviewer | staging/parity/idempotency tests |
| Package/profile adoption | installer maintainer | operational adoption reviewer | disposable-home/full gates |

## Coverage Rule

Every `KKL-REQ-*` and `KKL-SCN-*` must have a corresponding row in `SPEC_TEST_OBLIGATIONS.md`. No Phase may be marked complete when its mapped requirement lacks fresh evidence or a typed not-applicable/waiver decision.