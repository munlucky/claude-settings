# Harness Reliability Scenario Matrix

## Scope
- Plan root: `docs/implementation/harness-reliability-retro-2026-05-05`
- Critical scenarios must carry fresh pass evidence before a phase is treated as complete.

| Scenario ID | Requirement IDs | User Journey | Critical | Automation | Evidence | Notes |
|-------------|-----------------|--------------|----------|------------|----------|-------|
| SCN-HR-001 | REQ-HR-001, REQ-HR-015, REQ-HR-016 | A phase starts and records the runtime/capability blocker state before implementation work begins. | yes | automated | `SCN-HR-001 \| pass \| .claude/verification-verdict-phase01-final.json` | verified by Phase 01 final verdict and capability preflight output |
| SCN-HR-002 | REQ-HR-002, REQ-HR-019, REQ-HR-033 | Repeated bash/git/network failures are fingerprinted consistently and do not cause an unbounded retry loop. | yes | automated | `SCN-HR-002 \| pass \| .claude/scripts/lib/failure-classifier.test.mjs` | verified by classifier self-test and Phase 01 QA |
| SCN-HR-003 | REQ-HR-009, REQ-HR-010, REQ-HR-027 | A blocked phase still emits canonical QA/HANDOFF values that downstream verifiers can read. | yes | automated | `SCN-HR-003 \| pass \| node .claude/scripts/artifact-normalizer.test.mjs blocked-fixture` | verified by Phase 02 host recheck |
| SCN-HR-004 | REQ-HR-008, REQ-HR-028 | Korean phase docs and compact SCN evidence rows do not false-fail plan conformance or closeout parsing. | yes | automated | `SCN-HR-004 \| pass \| node .claude/scripts/artifact-normalizer.test.mjs korean-headings` | verified by Phase 02 host recheck |
| SCN-HR-005 | REQ-HR-005 | Runtime parity smoke runs without changing the reference fixture tree. | yes | automated | `SCN-HR-005 \| pass \| .claude/logs/agent-loop/runtime-parity-fixture-hash.log` | before/after hash unchanged |
| SCN-HR-006 | REQ-HR-006, REQ-HR-020 | Archive sync only moves completed real plan phases and leaves the reference fixture unarchived. | yes | automated | `SCN-HR-006 \| pass \| .claude/logs/agent-loop/archive-sync-fixture.log` | reference fixture preserved and `archivedPhaseDoc` not polluted |
| SCN-HR-007 | REQ-HR-012, REQ-HR-029 | An exact `pnpm` miss can be accepted when an approved equivalent proves the same capability. | yes | automated | `SCN-HR-007 \| pass \| node .claude/scripts/lib/command-resolver.test.mjs pnpm-equivalent` | equivalent command is explicit, not disguised as exact |
| SCN-HR-008 | REQ-HR-017, REQ-HR-018, REQ-HR-031 | Docker daemon absence is reported as no-retry handoff instead of repeated implementation failure. | yes | automated | `SCN-HR-008 \| pass \| node .claude/scripts/lib/command-resolver.test.mjs docker-daemon-missing` | daemon missing fixture returns `resume_later_handoff` |
| SCN-HR-009 | REQ-HR-003, REQ-HR-004, REQ-HR-030 | Host fallback preserves requested/effective runtime context for later diagnosis. | yes | automated | `SCN-HR-009 \| pass \| node .claude/scripts/verification-verdict-state.mjs self-test` | runtimeContext self-test covers fallback target matching |
| SCN-HR-010 | REQ-HR-021, REQ-HR-022, REQ-HR-023, REQ-HR-024, REQ-HR-025, REQ-HR-032 | A user can explain wall-clock, active, blocked, and manual closeout cost from one diagnosis bundle. | yes | automated | `SCN-HR-010 \| pass \| .claude/logs/meta-harness-trace/phase05-sample/diagnosis.json` | diagnosis includes phase counts and timing split |
| SCN-HR-011 | REQ-HR-035, REQ-HR-036 | Stale or imported verdicts cannot override the current active verdict. | yes | automated | `SCN-HR-011 \| pass \| node .claude/scripts/verification-verdict-state.mjs self-test` | superseded verdict fixture is non-active |
| SCN-HR-012 | REQ-HR-007 | Replay-lens long-run failure classes are fixed as executable regression fixtures. | yes | automated | `SCN-HR-012 \| pass \| node regression self-test suite` | classifier, resolver, normalizer, and path fixtures passed |
| SCN-HR-013 | REQ-HR-026, REQ-HR-038 | Harness reliability docs stay separated from product phase truth source. | yes | automated | `SCN-HR-013 \| pass \| bash .claude/scripts/knowledge-repo-audit.sh` | knowledge audit passed |
| SCN-HR-014 | REQ-HR-034, REQ-HR-037 | Closeout shows when ignored evidence or external blockers affect final audit. | yes | automated | `SCN-HR-014 \| pass \| .claude/verification.contract.yaml` | artifact and finish policy fields documented |

## Rules
- All rows above are verified as pass for the current Phase 01/02 closeout state.
- Later phases append `SCN-HR-*` rows and keep existing evidence immutable unless code changes invalidate it.
