# Kernel Project Knowledge Lifecycle Spec-Test Obligations

## Policy

- Behavior-changing obligations use `tdd_red_green` at the highest practical public seam.
- Existing Kernel isolation and completion behavior use `characterization_first` before modification.
- Package/profile/account-root and Git push surfaces use `evidence_mandatory`.
- Mechanical failures cannot be overridden by semantic review.
- Commands below are targets; final concrete command must remain sourced from `package.json`, `schemas/verification.contract.yaml`, or phase-local policy.

## Requirement Obligations

| Obligation ID | Requirement | Interface / highest public seam | Depth | Environment | Verification mode | Expected evidence |
|---|---|---|---|---|---|---|
| KKL-OBL-001 | KKL-REQ-001 | project identity resolver API | integration | Win/macOS/Linux fixtures | characterization + TDD | stable identity and collision report |
| KKL-OBL-002 | KKL-REQ-002 | installed Kernel runtime + state paths | E2E | disposable HOME | evidence_mandatory | Relay contamination count 0 |
| KKL-OBL-003 | KKL-REQ-003 | knowledge record validator | unit/contract | Node managed runtime | tdd_red_green | invalid transition/evidence rejection |
| KKL-OBL-004 | KKL-REQ-004 | `createKernelControlPlane().startRun/status` | integration | temp project/runtime | tdd_red_green | start revision/context receipt |
| KKL-OBL-005 | KKL-REQ-005 | stage context builder | integration/golden | fixture knowledge roots | tdd_red_green | deterministic selected IDs/digest |
| KKL-OBL-006 | KKL-REQ-006 | prompt-facing context renderer | security/fuzz | malicious fixtures | tdd_red_green | zero unsafe payload leakage |
| KKL-OBL-007 | KKL-REQ-007 | architecture/ontology applicability evaluator | integration | path/ADR/constraint fixtures | tdd_red_green | correct blocking/approval/obligations |
| KKL-OBL-008 | KKL-REQ-008 | tacit eligibility resolver | unit/integration | multi-run fixtures | tdd_red_green | single-run exclusion, repeated verified inclusion |
| KKL-OBL-009 | KKL-REQ-009 | candidate extraction API | integration | feature/bug/refactor diffs | tdd_red_green | run-bound candidate records |
| KKL-OBL-010 | KKL-REQ-010 | candidate review result | integration | stale/conflict/evidence fixtures | tdd_red_green | verified/rejected/approval decisions |
| KKL-OBL-011 | KKL-REQ-011 | `commitProjectKnowledge(runId)` | integration | Kernel runtime DB | tdd_red_green | pre-acceptance write rejection |
| KKL-OBL-012 | KKL-REQ-012 | project knowledge transaction | fault/concurrency | temp filesystem | tdd_red_green | atomic revision and recovery |
| KKL-OBL-013 | KKL-REQ-013 | supersession validator | unit/contract | JSONL fixtures | tdd_red_green | cycle/cross-project/authority rejection |
| KKL-OBL-014 | KKL-REQ-014 | knowledge closeout receipt | contract/tamper | temp runtime | tdd_red_green | stable digest and lineage |
| KKL-OBL-015 | KKL-REQ-015 | Kernel Git closeout public CLI/control-plane seam | integration | disposable Git repo | tdd_red_green | explicit approval enforcement |
| KKL-OBL-016 | KKL-REQ-016 | staging selection result | security/integration | mixed working tree | tdd_red_green | denylist and unrelated-change exclusion |
| KKL-OBL-017 | KKL-REQ-017 | remote parity verifier | integration | local bare remote | tdd_red_green | matched/mismatched result |
| KKL-OBL-018 | KKL-REQ-018 | completion status before/after Git events | integration | Kernel DB | characterization + TDD | completion decision unchanged |
| KKL-OBL-019 | KKL-REQ-019 | package/profile discovery surface | package contract | materialized payload | evidence_mandatory | one public entrypoint, internal-only capabilities |
| KKL-OBL-020 | KKL-REQ-020 | install/uninstall/rollback lifecycle | E2E | disposable HOME | evidence_mandatory | knowledge preserved, Relay untouched |

## Scenario Obligations

| Obligation ID | Scenario | Seam | Required checks | Blocking condition |
|---|---|---|---|---|
| KKL-SOBL-001 | KKL-SCN-001 first run | full Kernel lifecycle | context, completion, knowledge receipt | missing revision/receipt |
| KKL-SOBL-002 | KKL-SCN-002 ontology violation | PROVE transition | constraint verdict and no-write check | PROVE pass or write occurs |
| KKL-SOBL-003 | KKL-SCN-003 concurrent revision | knowledge commit API | two-run concurrency fixture | silent overwrite |
| KKL-SOBL-004 | KKL-SCN-004 transcript-only candidate | candidate reviewer | quarantine/rejection evidence | semantic verification allowed |
| KKL-SOBL-005 | KKL-SCN-005 close without Git request | close CLI/control plane | skip receipt | commit/push occurs |
| KKL-SOBL-006 | KKL-SCN-006 commit only | Git closeout | scoped stage, commit, no push | push attempted |
| KKL-SOBL-007 | KKL-SCN-007 commit and push | Git closeout + local remote | commit, push, parity | parity unavailable/mismatch claimed success |
| KKL-SOBL-008 | KKL-SCN-008 forbidden staging | staging policy | `.env`, DB, runtime state fixtures | forbidden path staged |
| KKL-SOBL-009 | KKL-SCN-009 uninstall | installed runtime lifecycle | uninstall manifest and state diff | knowledge or Relay deleted |
| KKL-SOBL-010 | KKL-SCN-010 crash recovery | atomic writer | injected crash per write boundary | partial revision visible |

## Gate Inventory

Phase-local targeted gates:

- identity/record contract tests
- context/retrieval/prompt purity tests
- ontology/tacit/candidate tests
- knowledge atomicity/supersession tests
- Git approval/staging/parity tests
- package/profile E2E tests

Repository gates confirmed by current policy:

- `npm run test:kernel`
- `npm run test:package`
- `npm run test:routing`
- `npm run test:eval`
- `npm run test:lab`
- `npm test`

## Seam Rationale

- Identity is tested through the resolver API, not parser internals.
- Knowledge loading is tested through Kernel stage context output and receipt.
- Knowledge write is tested through control-plane commit API and persisted revision.
- Git closeout is tested through the Kernel closeout seam against a real disposable Git repository and local bare remote.
- Package/profile behavior is tested from materialized/installed payload rather than source-only mocks.

## Completion Rule

An obligation passes only with fresh command provenance, source identity, mutation revision, and evidence artifact. Missing environment/backend is `blocked` or `indeterminate`, never implicit pass.