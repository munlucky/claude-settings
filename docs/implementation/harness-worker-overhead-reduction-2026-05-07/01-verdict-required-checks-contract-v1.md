# Phase 01: Verdict RequiredChecks Contract (v1)

## Source Mapping

| Req ID | Source Section | Requirement Summary | This Phase Handling |
|---|---|---|---|
| HWO-003 | User overhead item 3 | `missingRequiredChecks` loops come from `"missing": ["none"]` placeholder ambiguity | Normalize or reject placeholder values in writer and gate |
| HWO-001 | User overhead item 1 | Completion evidence churn must stop before new attempts are launched | Make verdict schema deterministic so gate decisions are stable |
| HWO-012 | Prior NWFP-009/NWFP-010 | Same blocker should not repeat as retryable unknown evidence | Add regression tests for placeholder and real missing checks |

## Goal

- Make `requiredChecks.missing` a machine-only list where "no missing checks" is always `[]`.

## Expected Outcome

- `write-verification-verdict.py --missing-check none` and equivalent placeholders produce `requiredChecks.missing: []`.
- Real missing check names remain in `requiredChecks.missing` and still fail the completion gate.
- Gate logic defensively ignores legacy placeholder values without weakening real missing evidence enforcement.

## Phase Execution Metadata

```yaml
phaseExecution:
  schemaVersion: 1
  parallelEligible: false
  parallelGroup: "wave-1"
  dependsOn: []
  conflictsWith:
    - "02"
    - "05"
  ownedPaths:
    - ".claude/scripts/write-verification-verdict.py"
    - ".claude/scripts/agent-loop-phase-state.mjs"
    - ".claude/scripts/verification-verdict-state.mjs"
  readOnlyPaths:
    - ".claude/verification.contract.yaml"
    - ".claude/verification-verdict-*.json"
    - "docs/implementation/harness-nonwork-failure-prevention-2026-05-07/00-master-plan-v1.md"
  sharedMutablePaths: []
  requiresManualEvidence: false
  mergePolicy: "sequential_shared_harness"
```

## Scope

- In scope:
  - Normalize `none`, `없음`, `n/a`, `na`, `null`, and empty strings in missing-check inputs to an empty list.
  - Keep `expected` and `passed` as actual check-name lists; placeholder values there must fail with a clear usage error.
  - Add gate-side normalization for legacy verdict files already containing placeholder missing values.
  - Add self-test or unit fixtures for placeholder and real missing values.
- Out of scope:
  - Redesigning the full verdict schema.
  - Relaxing `evidenceFresh`, `blocking`, `score`, or command pass requirements.
  - Rewriting historical verdict artifacts.

## Preconditions And Inputs

- Required docs:
  - `docs/implementation/harness-worker-overhead-reduction-2026-05-07/00-master-plan-v1.md`
- Required current code:
  - `.claude/scripts/write-verification-verdict.py`
  - `.claude/scripts/agent-loop-phase-state.mjs`
  - `.claude/scripts/verification-verdict-state.mjs`

## Detailed Tasks

| ID | Task | Steps | Done Criteria |
|---|---|---|---|
| P01-1 | Add writer normalization | Add helper that normalizes missing-check placeholders to `[]` before payload, fingerprints, score inference, and blocker inference | Placeholder missing values do not appear in output JSON |
| P01-2 | Reject invalid expected/passed placeholders | Add validation for `--expected-check` and `--passed-check` so placeholder values fail fast | Writer exits nonzero with a clear message for invalid expected/passed input |
| P01-3 | Harden gate normalization | Normalize legacy `requiredChecks.missing` before checking `missingRequiredChecks` | Legacy `"none"` does not fail; real values still fail |
| P01-4 | Add regression coverage | Add fixtures through writer command and gate/self-test path | Placeholder and real-missing scenarios are both covered |

## Critical Product Scenarios

| ID | User-Visible Expectation | Verification Command | Expected Signal | Evidence Path |
|---|---|---|---|---|
| SCN-P01-1 | Operator can write a passing verdict without memorizing JSON empty-array syntax | `python3 .claude/scripts/write-verification-verdict.py --output /tmp/hwo-verdict-none.json --run-id hwo-none --phase-number 1 --expected-check smoke --passed-check smoke --missing-check none` | JSON contains `"missing": []` | `QA_REPORT.md` command output |
| SCN-P01-2 | Real missing evidence still blocks clean completion | `node .claude/scripts/agent-loop-phase-state.mjs self-test` plus added fixture | `missingRequiredChecks` appears only for real missing check names | `QA_REPORT.md` self-test output |
| SCN-P01-3 | Invalid placeholder in expected/passed fails before writing misleading artifact | `python3 .claude/scripts/write-verification-verdict.py ... --expected-check none` | Nonzero exit and no valid passing verdict written | `QA_REPORT.md` command output |

## Exact Execution Targets

| ID | Files To Create | Files To Modify | Files To Test | Commands | Expected Fail/Pass Signals |
|---|---|---|---|---|---|
| P01-1 | none | `.claude/scripts/write-verification-verdict.py` | `/tmp/hwo-verdict-none.json` | `python3 .claude/scripts/write-verification-verdict.py --output /tmp/hwo-verdict-none.json --run-id hwo-none --phase-number 1 --expected-check smoke --passed-check smoke --missing-check none` | Before fix: `"missing": ["none"]`; after fix: `"missing": []` |
| P01-2 | none | `.claude/scripts/write-verification-verdict.py` | none | `python3 .claude/scripts/write-verification-verdict.py --output /tmp/hwo-invalid.json --run-id hwo-invalid --phase-number 1 --expected-check none` | Nonzero exit with validation message |
| P01-3 | none | `.claude/scripts/agent-loop-phase-state.mjs` | existing self-test fixtures or added inline fixture | `node .claude/scripts/agent-loop-phase-state.mjs self-test` | Exit 0 and real missing checks still fail |
| P01-4 | none | `.claude/scripts/verification-verdict-state.mjs` if shared helper is placed there | same | `node .claude/scripts/verification-verdict-state.mjs self-test` | Exit 0 |

## Blockers And Review

- Blocker condition: A real missing required check is accidentally converted to empty list.
- First review checkpoint: Review placeholder token list before modifying gate behavior.
- Re-review trigger: Any change that affects `score.verdict`, `blockerClass`, or `artifactFingerprint` inference.
- Verification evidence path: `docs/implementation/harness-worker-overhead-reduction-2026-05-07/execution/01-phase-01-verdict-required-checks-contract-v1/QA_REPORT.md`

## Validation Plan

- [ ] Writer placeholder smoke command.
- [ ] Writer invalid expected/passed command.
- [ ] `node .claude/scripts/agent-loop-phase-state.mjs self-test`
- [ ] `node .claude/scripts/verification-verdict-state.mjs self-test`
- [ ] `node --test .claude/scripts/verify-phase-closeout.test.mjs`

## Evidence To Mark Done

- Writer output showing `missing: []` for placeholders.
- Gate/self-test output showing real missing checks still block.
- Review note confirming no completed historical artifact was rewritten.

## Deliverables

- Normalized verdict writer.
- Gate-side legacy placeholder guard.
- Regression coverage for placeholder and real missing checks.

## Phase Completion Checklist

- [ ] Placeholder missing checks serialize as `[]`.
- [ ] Placeholder expected/passed checks fail fast.
- [ ] Real missing checks still trigger gate failure.
- [ ] Existing closeout tests pass.

## Handoff Notes

- Phase 02 can rely on stable verdict missing-check semantics when adding runtime blocker classifications.
