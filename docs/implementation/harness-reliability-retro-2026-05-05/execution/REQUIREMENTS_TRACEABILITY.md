# Harness Reliability Requirements Traceability

## Scope
- Plan root: `docs/implementation/harness-reliability-retro-2026-05-05`
- Execution root: `docs/implementation/harness-reliability-retro-2026-05-05/execution`
- Current coverage: Phase 01 and Phase 02 verified evidence.

| Requirement ID | Source Doc | Summary | Slice | Implementation Status | Verification Path | Evidence | Blocker |
|----------------|------------|---------|-------|-----------------------|-------------------|----------|---------|
| REQ-HR-001 | `ISSUE_REGISTER.md` | Phase start capability matrix is available before worker execution. | Phase 01 | verified | automated | `.claude/verification-verdict-phase01-final.json`; `execution/01-phase-01-capability-and-fingerprint-foundation-v1/QA_REPORT.md`; pass | none |
| REQ-HR-002 | `ISSUE_REGISTER.md` | Repeated environment failures produce stable fingerprints and avoid blind retry loops. | Phase 01 | verified | automated | `.claude/verification-verdict-phase01-final.json`; `execution/01-phase-01-capability-and-fingerprint-foundation-v1/SCORECARD.md`; pass | none |
| REQ-HR-015 | `ISSUE_REGISTER.md` | Git EPERM is classified as a capability/preflight blocker with a host-route hint. | Phase 01 | verified | automated | `.claude/verification-verdict-phase01-final.json`; `.claude/logs/agent-loop/capabilities-*.json`; pass | none |
| REQ-HR-016 | `ISSUE_REGISTER.md` | Bash access denied is classified as a no-retry verifier/runtime blocker. | Phase 01 | verified | automated | `.claude/verification-verdict-phase01-final.json`; `.claude/logs/agent-loop/capabilities-*.json`; pass | none |
| REQ-HR-019 | `ISSUE_REGISTER.md` | `sameFailureClassCount` participates in runner retry decisions. | Phase 01 | verified | automated | `.claude/verification-verdict-phase01-final.json`; `execution/01-phase-01-capability-and-fingerprint-foundation-v1/QA_REPORT.md`; pass | none |
| REQ-HR-033 | `ISSUE_REGISTER.md` | Network fetch failures have a distinct canonical failure class. | Phase 01 | verified | automated | `.claude/verification-verdict-phase01-final.json`; `.claude/scripts/lib/failure-classifier.test.mjs`; pass | none |
| REQ-HR-008 | `ISSUE_REGISTER.md` | Korean heading aliases are recognized by conformance/closeout tooling. | Phase 02 | verified | automated | `node .claude/scripts/artifact-normalizer.test.mjs korean-headings`; `execution/02-phase-02-artifact-schema-normalizer-v1/QA_REPORT.md`; pass | none |
| REQ-HR-009 | `ISSUE_REGISTER.md` | QA generator and workflow enforcement share canonical artifact schema. | Phase 02 | verified | automated | `node .claude/scripts/artifact-normalizer.test.mjs`; `bash .claude/scripts/workflow-enforcement.sh verify`; pass | none |
| REQ-HR-010 | `ISSUE_REGISTER.md` | Blocked state enum values are canonicalized. | Phase 02 | verified | automated | `node .claude/scripts/artifact-normalizer.test.mjs blocked-fixture`; pass | none |
| REQ-HR-027 | `ISSUE_REGISTER.md` | Blocked QA/HANDOFF generation stays verifier-readable. | Phase 02 | verified | automated | `execution/02-phase-02-artifact-schema-normalizer-v1/QA_REPORT.md`; `execution/02-phase-02-artifact-schema-normalizer-v1/HANDOFF.md`; pass | none |
| REQ-HR-028 | `ISSUE_REGISTER.md` | SCN compact evidence parser and template use the same accepted format. | Phase 02 | verified | automated | `execution/SCENARIO_MATRIX.md`; `node .claude/scripts/artifact-normalizer.test.mjs`; pass | none |
| REQ-HR-005 | `ISSUE_REGISTER.md` | Runtime parity smoke does not mutate the reference fixture. | Phase 03 | verified | automated | `.claude/logs/agent-loop/runtime-parity-fixture-hash.log`; pass | none |
| REQ-HR-006 | `ISSUE_REGISTER.md` | Archive sync does not pollute reference fixture paths or `archivedPhaseDoc`. | Phase 03 | verified | automated | `.claude/logs/agent-loop/archive-sync-fixture.log`; pass | none |
| REQ-HR-020 | `ISSUE_REGISTER.md` | Active phase traversal is authoritative from `phase-status.yaml`. | Phase 03 | verified | automated | `node .claude/scripts/phase-worktree-coordinator.mjs self-test`; `node --check .claude/scripts/agent-loop-phase-state.mjs`; pass | none |
| REQ-HR-003 | `ISSUE_REGISTER.md` | Host fallback route is represented as requested/effective runtime split. | Phase 04 | verified | automated | `node .claude/scripts/verification-verdict-state.mjs self-test`; pass | none |
| REQ-HR-004 | `ISSUE_REGISTER.md` | Implementation verification and meta verifier blockers are separated. | Phase 04 | verified | automated | `.claude/logs/agent-loop/capabilities-2026-05-05T10-05-40-677Z.json`; pass | none |
| REQ-HR-011 | `ISSUE_REGISTER.md` | Verdict writer accepts runtime fallback reason. | Phase 04 | verified | automated | `python -m py_compile .claude/scripts/write-verification-verdict.py`; pass | none |
| REQ-HR-012 | `ISSUE_REGISTER.md` | Package manager discovery supports approved equivalent commands. | Phase 04 | verified | automated | `node .claude/scripts/lib/command-resolver.test.mjs pnpm-equivalent`; pass | none |
| REQ-HR-013 | `ISSUE_REGISTER.md` | Cache/network style command failures classify as environment fallback states. | Phase 04 | verified | automated | `node .claude/scripts/lib/command-resolver.test.mjs`; pass | none |
| REQ-HR-014 | `ISSUE_REGISTER.md` | Python/pytest resolver contract supports exact/equivalent probes. | Phase 04 | verified | automated | `node .claude/scripts/lib/command-resolver.test.mjs`; pass | none |
| REQ-HR-017 | `ISSUE_REGISTER.md` | Docker static config validation and daemon smoke are separated. | Phase 04 | verified | automated | `node .claude/scripts/lib/command-resolver.test.mjs docker-daemon-missing`; pass | none |
| REQ-HR-018 | `ISSUE_REGISTER.md` | Docker daemon absence avoids retry waste and routes to handoff. | Phase 04 | verified | automated | `node .claude/scripts/lib/command-resolver.test.mjs docker-daemon-missing`; pass | none |
| REQ-HR-029 | `ISSUE_REGISTER.md` | Exact vs equivalent command policy is explicit. | Phase 04 | verified | automated | `node .claude/scripts/lib/command-resolver.test.mjs pnpm-equivalent`; pass | none |
| REQ-HR-030 | `ISSUE_REGISTER.md` | Runtime target confusion is reduced through runtimeContext fields. | Phase 04 | verified | automated | `node .claude/scripts/verification-verdict-state.mjs self-test`; pass | none |
| REQ-HR-031 | `ISSUE_REGISTER.md` | Dependency-aware phase gate detects Docker daemon as hard external dependency. | Phase 04 | verified | automated | `.claude/logs/agent-loop/capabilities-2026-05-05T10-05-40-677Z.json`; pass | none |
| REQ-HR-021 | `ISSUE_REGISTER.md` | Wall-clock and runner active time are represented separately. | Phase 05 | verified | automated | `.claude/logs/meta-harness-trace/phase05-sample/diagnosis.json`; pass | none |
| REQ-HR-022 | `ISSUE_REGISTER.md` | Verification, remediation, blocked, and manual closeout time are separately attributed. | Phase 05 | verified | automated | `.claude/logs/meta-harness-trace/phase05-sample/diagnosis.json`; pass | none |
| REQ-HR-023 | `ISSUE_REGISTER.md` | Host manual closeout cost has a manifest field. | Phase 05 | verified | automated | `.claude/logs/meta-harness-trace/phase05-sample/diagnosis.json`; pass | none |
| REQ-HR-024 | `ISSUE_REGISTER.md` | Oversized raw logs are summarized into a diagnosis bundle. | Phase 05 | verified | automated | `.claude/logs/meta-harness-trace/phase05-sample/diagnosis.md`; pass | none |
| REQ-HR-025 | `ISSUE_REGISTER.md` | Diagnosis manifest connects scattered truth-source evidence. | Phase 05 | verified | automated | `.claude/logs/meta-harness-trace/phase05-sample/diagnosis.json`; pass | none |
| REQ-HR-032 | `ISSUE_REGISTER.md` | Planned/completed/blocked/pending/remaining counters are separated. | Phase 05 | verified | automated | `.claude/logs/meta-harness-trace/phase05-sample/diagnosis.json`; pass | none |
| REQ-HR-035 | `ISSUE_REGISTER.md` | Reusable verification result import is represented in diagnosis/verdict state. | Phase 05 | verified | automated | `node .claude/scripts/verification-verdict-state.mjs self-test`; pass | none |
| REQ-HR-036 | `ISSUE_REGISTER.md` | Stale/superseded verdicts do not override active passed verdicts. | Phase 05 | verified | automated | `node .claude/scripts/verification-verdict-state.mjs self-test`; pass | none |
| REQ-HR-007 | `ISSUE_REGISTER.md` | Windows path handling regression is fixed and covered. | Phase 06 | verified | automated | `node .claude/scripts/lib/verification-contract.test.mjs`; pass | none |
| REQ-HR-026 | `ISSUE_REGISTER.md` | Product phase scope and harness improvement scope are separated in docs. | Phase 06 | verified | automated | `.claude/docs/guidelines/long-running-harness.md`; `bash .claude/scripts/knowledge-repo-audit.sh`; pass | none |
| REQ-HR-034 | `ISSUE_REGISTER.md` | Final audit partial-mode decision is documented without fake-pass semantics. | Phase 06 | verified | automated | `.claude/docs/guidelines/verification-contract.md`; pass | none |
| REQ-HR-037 | `ISSUE_REGISTER.md` | Ignored evidence include policy is documented. | Phase 06 | verified | automated | `.claude/verification.contract.yaml`; `.claude/docs/guidelines/meta-harness-trace.md`; pass | none |
| REQ-HR-038 | `ISSUE_REGISTER.md` | Docs structural audit catches drift after external writes. | Phase 06 | verified | automated | `.claude/knowledge-repo-audit-knowledge-audit-20260505-193931.json`; pass | none |

## Coverage Rules
- Every in-scope `REQ-*` row has a phase owner and a verification evidence path.
- `verified` means a fresh command or structured verdict exists in this execution root.
- Later phases append rows instead of rewriting Phase 01/02 evidence.
