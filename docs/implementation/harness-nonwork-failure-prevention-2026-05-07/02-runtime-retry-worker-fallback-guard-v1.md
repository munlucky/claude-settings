# Phase 02: Runtime Retry And Worker Fallback Guard (v1)

## Source Mapping

| Req ID | Source Section | Requirement Summary | This Phase Handling |
|---|---|---|---|
| NWFP-002 | User failure inventory | Repeated shell snapshot/MCP/PATH/plugin noise must not create blind loops | Add runtime warning summarization and retry suppression |
| NWFP-004 | User improvement units | EPERM/access denied/spawn blocked/verifier unavailable get one controlled fallback | Add runner decision policy and isolated Codex home fallback |
| NWFP-009 | Prior reliability baseline | Same environment failure suppresses repeated attempts | Wire classifier output into worker retry decisions |

## Goal

- Keep runtime and verifier availability failures out of implementation auto-fix loops.

## Expected Outcome

- Worker attempts do not relaunch broad implementation when the actual failure is `spawn_blocked`, `verifier_unavailable`, `node_spawn_eperm`, Codex storage denied, or access denied.
- Codex execution uses isolated/ephemeral state where supported and records fallback or blocker evidence when host storage is unavailable.

## Phase Execution Metadata

```yaml
phaseExecution:
  schemaVersion: 1
  parallelEligible: false
  parallelGroup: "wave-2"
  dependsOn:
    - "01"
  conflictsWith:
    - "01"
    - "03"
  ownedPaths:
    - ".claude/scripts/runtime-cli.mjs"
    - ".claude/scripts/agent-loop-phase-runtime.mjs"
    - ".claude/scripts/agent-loop-phase-runner.mjs"
    - ".claude/scripts/agent-loop-phase-attempt.mjs"
  readOnlyPaths:
    - ".claude/scripts/lib/failure-classifier.mjs"
    - ".claude/scripts/phase-capability-preflight.mjs"
    - ".claude/logs/agent-loop/"
  sharedMutablePaths: []
  requiresManualEvidence: false
  mergePolicy: "sequential_shared_harness"
```

## Scope

- Included:
  - Add runtime stop reason detection for EPERM/access denied/spawn blocked/verifier unavailable/Codex storage denied.
  - Add one controlled fallback route when fallback is available: isolated Codex probe home or allowed alternate runtime.
  - Add retry suppression when `sameFailureClassCount >= 2` or a no-retry environment code is active.
  - Record delegated terminal exit code separately from normalized completion verdict.
- Excluded:
  - Changing completion criteria for real verifier failures.
  - Editing verdict identity logic, phase status rebuild logic, or Git closeout logic.

## Preconditions And Inputs

- Phase 01 taxonomy changes are merged and tested.
- Required current code:
  - `.claude/scripts/runtime-cli.mjs`
  - `.claude/scripts/agent-loop-phase-runtime.mjs`
  - `.claude/scripts/agent-loop-phase-runner.mjs`
  - `.claude/scripts/agent-loop-phase-attempt.mjs`

## Detailed Tasks

| ID | Task | Steps | Done Criteria |
|---|---|---|---|
| P02-1 | Detect runtime-only failure logs | Extend stop-reason detection for Codex storage/session, readonly DB, Node EPERM, bash access denied, spawn blocked, verifier unavailable | Runtime failures produce environment stop reasons, not `phase-failed` |
| P02-2 | Add controlled fallback policy | Use isolated Codex home or alternate runtime only once when policy allows | Fallback evidence records requested/effective runtime and reason |
| P02-3 | Suppress worker auto-fix for environment blockers | Update attempt decisions so no-retry environment codes stop or hand off after fallback | Broad auto-fix prompt is not generated for environment blockers |
| P02-4 | Separate terminal exit from normalized verdict | Preserve delegated terminal exit code in stop detail without overriding clean-finish artifacts | Status can show `lastStopReasonCode` while `normalizedRunVerdict` reflects artifact truth |

## Exact Execution Targets

| ID | Create Files | Modify Files | Test Files | Command | Expected Fail/Pass Signal |
|---|---|---|---|---|---|
| P02-1 | none | `.claude/scripts/agent-loop-phase-runtime.mjs` | existing runtime self-test fixtures or new inline self-test if added | `node --check .claude/scripts/agent-loop-phase-runtime.mjs` | Exit 0 |
| P02-2 | none | `.claude/scripts/runtime-cli.mjs` | none | `node .claude/scripts/runtime-cli.mjs codex-probe-env /tmp/codex-probe-home-smoke` | Prints `HOME`, `CODEX_HOME`, `XDG_*` assignments |
| P02-3 | none | `.claude/scripts/agent-loop-phase-attempt.mjs`, `.claude/scripts/agent-loop-phase-runner.mjs` | none | `node --check .claude/scripts/agent-loop-phase-attempt.mjs && node --check .claude/scripts/agent-loop-phase-runner.mjs` | Exit 0 |
| P02-4 | none | `.claude/scripts/agent-loop.mjs` if needed | none | `node --check .claude/scripts/agent-loop.mjs` | Exit 0 |

## Critical Product Scenarios

| Scenario | User-visible Expectation | Command That Proves It | Expected Pass Signal | Evidence Path |
|---|---|---|---|---|
| SCN-P02-1 | Runtime EPERM stops as environment blocker instead of implementation retry | targeted fixture or `node --test` for attempt decision if added | Decision is `stop-loop` or one fallback, not `auto-fix` | `QA_REPORT.md` runtime decision section |
| SCN-P02-2 | Codex storage denied uses isolated/fallback route once | `node .claude/scripts/runtime-cli.mjs codex-probe-env /tmp/codex-probe-home-smoke` | isolated env assignments are generated | `QA_REPORT.md` command log |
| SCN-P02-3 | Delegated terminal nonzero exit can coexist with clean artifact truth | fixture or status normalization smoke | `lastStopReasonCode` remains separate from `normalizedRunVerdict` | `QA_REPORT.md` status excerpt |

## Blockers And Review

- Blocker condition: A real test assertion failure is incorrectly classified as environment failure, or runtime fallback can loop more than once for the same class.
- First review checkpoint: Review fallback policy before enabling alternate runtime execution.
- Re-review trigger: Any change to worker prompt construction or auto-fix decision order.
- Verification evidence path: `docs/implementation/harness-nonwork-failure-prevention-2026-05-07/execution/02-phase-02-runtime-retry-and-worker-fallback-guard-v1/QA_REPORT.md`

## Verification Plan

- [ ] Syntax: `node --check .claude/scripts/runtime-cli.mjs && node --check .claude/scripts/agent-loop-phase-runtime.mjs && node --check .claude/scripts/agent-loop-phase-runner.mjs && node --check .claude/scripts/agent-loop-phase-attempt.mjs`
- [ ] Runtime env smoke: `node .claude/scripts/runtime-cli.mjs codex-probe-env /tmp/codex-probe-home-smoke`
- [ ] Boundary regression: `bash .claude/scripts/verify-phase-runner-boundary.sh`

## Completion Evidence

- Runtime decision fixture output or equivalent QA excerpt.
- Boundary verifier output.
- Diff summary for runtime and runner decision files.

## Deliverables

- Environment-aware runtime stop reason detection.
- One-shot fallback and retry suppression behavior.
- Delegated terminal exit code separated from normalized verdict semantics.

## Phase Completion Checklist

- [ ] Runtime environment blockers do not enter implementation auto-fix loops.
- [ ] Fallback is capped and recorded.
- [ ] Clean artifact completion remains authoritative over delegated terminal exit code.
- [ ] Verification commands pass or blockers are classified by Phase 01 taxonomy.

## Handoff Notes

- Phase 03 must use runtime identity fields from the active run lease when writing or selecting verdicts.
