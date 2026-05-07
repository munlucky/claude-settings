# Phase 03: Verdict Identity And Staleness Guard (v1)

## Source Mapping

| Req ID | Source Section | Requirement Summary | This Phase Handling |
|---|---|---|---|
| NWFP-005 | User improvement units | Verdict staleness uses run lease, plan dir, status file, and git tree identity | Add identity fields and relevance checks |
| NWFP-009 | Prior reliability baseline | Stale verdicts cannot override active passed verdicts | Extend self-tests for mismatched identity |

## Goal

- Prevent old or cross-run structured verdicts from blocking current runtime health or phase completion.

## Expected Outcome

- Verdict selection accepts only files matching the active phase plus identity constraints when identity fields are present.
- Older blocked verdicts with mismatched `runLeaseId`, `planDir`, `statusFile`, or `gitTreeFingerprint` are treated as stale/inactive.

## Phase Execution Metadata

```yaml
phaseExecution:
  schemaVersion: 1
  parallelEligible: false
  parallelGroup: "wave-2"
  dependsOn:
    - "01"
  conflictsWith:
    - "02"
    - "04"
    - "05"
  ownedPaths:
    - ".claude/scripts/verification-verdict-state.mjs"
    - ".claude/scripts/write-verification-verdict.py"
  readOnlyPaths:
    - ".claude/scripts/phase-run-lease.mjs"
    - ".claude/scripts/agent-loop-phase-state.mjs"
    - ".claude/scripts/agent-loop-phase-runner.mjs"
  sharedMutablePaths: []
  requiresManualEvidence: false
  mergePolicy: "sequential_shared_harness"
```

## Scope

- Included:
  - Add verdict schema v3 identity object: `runLeaseId`, `planDir`, `statusFile`, `gitTreeFingerprint`.
  - Add fallback compatibility for v2 verdicts without identity fields.
  - Add `staleReason`/inactive reporting for mismatches.
  - Extend runtime health and completion gate verdict filtering through existing `isRelevantVerificationVerdict`.
- Excluded:
  - Rebuilding `phase-status.yaml`.
  - Changing runtime parity verdict levels.
  - Changing phase closeout artifact sync.

## Preconditions And Inputs

- Phase 01 taxonomy changes are available.
- Required current code:
  - `.claude/scripts/verification-verdict-state.mjs`
  - `.claude/scripts/write-verification-verdict.py`

## Detailed Tasks

| ID | Task | Steps | Done Criteria |
|---|---|---|---|
| P03-1 | Extend verdict writer | Add optional CLI args and payload `identity` fields; compute git tree fingerprint when supplied or via caller-provided value | Writer remains backward compatible and `py_compile` passes |
| P03-2 | Enforce identity relevance | Update normalization/relevance checks to mark mismatched identity stale/inactive | Self-test covers mismatched lease, plan, status, and git tree |
| P03-3 | Preserve explicit references | Keep explicit QA-referenced verdict paths valid only when not stale/superseded and identity matches | Completion gate cannot revive stale explicit verdicts |
| P03-4 | Surface stale reason | Runtime health detail includes stale reason and ignored verdict path when useful | QA can cite why old blocker was ignored |

## Exact Execution Targets

| ID | Create Files | Modify Files | Test Files | Command | Expected Fail/Pass Signal |
|---|---|---|---|---|---|
| P03-1 | none | `.claude/scripts/write-verification-verdict.py` | none | `python3 -m py_compile .claude/scripts/write-verification-verdict.py` | Exit 0 |
| P03-2 | none | `.claude/scripts/verification-verdict-state.mjs` | existing self-test in same file | `node .claude/scripts/verification-verdict-state.mjs self-test` | Includes identity mismatch stale fixtures |
| P03-3 | none | `.claude/scripts/verification-verdict-state.mjs` | same | `node --check .claude/scripts/verification-verdict-state.mjs` | Exit 0 |

## Critical Product Scenarios

| Scenario | User-visible Expectation | Command That Proves It | Expected Pass Signal | Evidence Path |
|---|---|---|---|---|
| SCN-P03-1 | Phase 06 is not blocked by a stale Phase 05 blocked verdict | `node .claude/scripts/verification-verdict-state.mjs self-test` | mismatched identity verdict is inactive | `QA_REPORT.md` self-test output |
| SCN-P03-2 | Explicit QA verdict reference cannot bypass stale identity | `node .claude/scripts/verification-verdict-state.mjs self-test` | explicit stale verdict still ignored | `QA_REPORT.md` self-test output |
| SCN-P03-3 | Backward compatible v2 pass still works when no identity is present | `node .claude/scripts/verification-verdict-state.mjs self-test` | legacy fixture remains relevant by existing phase rules | `QA_REPORT.md` self-test output |

## Blockers And Review

- Blocker condition: Existing v2 verdicts become unusable, or identity mismatch is ignored when identity fields are present.
- First review checkpoint: Review schema changes before connecting writers in runtime parity or closeout.
- Re-review trigger: Any change to `isRelevantVerificationVerdict` phase/path matching rules.
- Verification evidence path: `docs/implementation/harness-nonwork-failure-prevention-2026-05-07/execution/03-phase-03-verdict-identity-and-staleness-guard-v1/QA_REPORT.md`

## Verification Plan

- [ ] Syntax: `node --check .claude/scripts/verification-verdict-state.mjs`
- [ ] Python compile: `python3 -m py_compile .claude/scripts/write-verification-verdict.py`
- [ ] Behavior: `node .claude/scripts/verification-verdict-state.mjs self-test`

## Completion Evidence

- Self-test output showing identity stale cases.
- Writer compile output.
- Example v3 verdict payload excerpt in QA.

## Deliverables

- Verdict identity schema.
- Active verdict relevance guard.
- Regression coverage for stale blocked verdict contamination.

## Phase Completion Checklist

- [ ] Identity fields are written or accepted as optional.
- [ ] Mismatched identity verdicts are inactive.
- [ ] Legacy verdict compatibility remains intact.
- [ ] Verification commands pass.

## Handoff Notes

- Phase 04 should rely on this identity guard when rebuilding status from artifacts.
