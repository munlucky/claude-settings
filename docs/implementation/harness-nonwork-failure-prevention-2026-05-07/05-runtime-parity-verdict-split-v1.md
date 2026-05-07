# Phase 05: Runtime Parity Verdict Split (v1)

## Source Mapping

| Req ID | Source Section | Requirement Summary | This Phase Handling |
|---|---|---|---|
| NWFP-007 | User improvement units | Runtime parity separates skipped probes, warning passes, exercised runs, and full exercise | Add runtime exercise levels and verdict split |
| NWFP-005 | User improvement units | Verdicts must carry active identity | Use Phase 03 identity fields for parity verdicts |

## Goal

- Stop skipped or partially exercised runtime parity probes from being reported as full pass.

## Expected Outcome

- Runtime parity output distinguishes:
  - `passed`
  - `passed_with_environment_warning`
  - `passed_with_skipped_probe`
  - `fully_exercised`
- Real Codex probe skipped cannot close as full exercise.

## Phase Execution Metadata

```yaml
phaseExecution:
  schemaVersion: 1
  parallelEligible: false
  parallelGroup: "wave-3"
  dependsOn:
    - "03"
  conflictsWith:
    - "03"
    - "04"
    - "06"
  ownedPaths:
    - ".claude/scripts/verify-phase-runtime-parity.mjs"
    - ".claude/scripts/verify-phase-runtime-parity.sh"
    - ".claude/scripts/verify-phase-runtime-parity-shell-core.sh"
  readOnlyPaths:
    - ".claude/scripts/write-verification-verdict.py"
    - ".claude/scripts/verification-verdict-state.mjs"
    - ".claude/docs/runtime-parity-reference-plan/"
    - ".claude/verification.contract.yaml"
  sharedMutablePaths: []
  requiresManualEvidence: false
  mergePolicy: "sequential_shared_harness"
```

## Scope

- Included:
  - Add `runtimeExerciseLevel` semantics to runtime parity verdicts.
  - Preserve environment warnings without claiming full runtime exercise.
  - Ensure skipped Codex probes produce `passed_with_skipped_probe` or a clear blocker, depending on policy.
  - Emit structured evidence that Phase 03 can evaluate.
- Excluded:
  - Changing runtime selection policy.
  - Changing worker fallback policy.
  - Changing closeout contract beyond documenting new evidence semantics.

## Preconditions And Inputs

- Phase 03 verdict identity fields are available.
- Required current code:
  - `.claude/scripts/verify-phase-runtime-parity.mjs`
  - `.claude/scripts/verify-phase-runtime-parity.sh`
  - `.claude/scripts/verify-phase-runtime-parity-shell-core.sh`

## Detailed Tasks

| ID | Task | Steps | Done Criteria |
|---|---|---|---|
| P05-1 | Define exercise levels | Add shell/core output markers and JS wrapper parsing for skipped/warning/exercised/full | Output is unambiguous in compact and normal modes |
| P05-2 | Write split verdicts | Ensure runtime parity verdict uses `runtimeExerciseLevel` and Phase 03 identity fields | Structured verdict does not claim full exercise when probes are skipped |
| P05-3 | Add fixture coverage | Add shell-core fixture paths or self-test mode if available | Runtime parity smoke covers skipped-probe behavior |
| P05-4 | Preserve strict failures | Real parity mismatch or required runtime unavailable still fails according to existing policy | No downgrade of real failures to warnings |

## Exact Execution Targets

| ID | Create Files | Modify Files | Test Files | Command | Expected Fail/Pass Signal |
|---|---|---|---|---|---|
| P05-1 | none | `.claude/scripts/verify-phase-runtime-parity-shell-core.sh` | none | `bash -n .claude/scripts/verify-phase-runtime-parity-shell-core.sh` | Exit 0 |
| P05-2 | none | `.claude/scripts/verify-phase-runtime-parity.mjs`, `.claude/scripts/verify-phase-runtime-parity.sh` | none | `node --check .claude/scripts/verify-phase-runtime-parity.mjs && bash -n .claude/scripts/verify-phase-runtime-parity.sh` | Exit 0 |
| P05-3 | none or fixture under ignored/temp path only | runtime parity scripts | existing parity smoke | `bash .claude/scripts/verify-phase-runtime-parity.sh .claude/docs/runtime-parity-reference-plan` | Output reports accurate exercise level |

## Critical Product Scenarios

| Scenario | User-visible Expectation | Command That Proves It | Expected Pass Signal | Evidence Path |
|---|---|---|---|---|
| SCN-P05-1 | Skipped real Codex probe is visible as skipped, not full pass | `bash .claude/scripts/verify-phase-runtime-parity.sh .claude/docs/runtime-parity-reference-plan` | verdict/output contains skipped-probe level when probe is skipped | `QA_REPORT.md` parity excerpt |
| SCN-P05-2 | Environment warning pass remains nonfatal but distinct | same parity command under warning fixture or current environment | `passed_with_environment_warning` appears only for warning cases | `QA_REPORT.md` parity excerpt |
| SCN-P05-3 | Fully exercised parity is reserved for real exercised probes | same parity command when both probes run | `fully_exercised` only when actual probes ran | `QA_REPORT.md` parity excerpt |

## Blockers And Review

- Blocker condition: Runtime parity returns full pass while any required real probe is skipped.
- First review checkpoint: Review new verdict labels before updating documentation or contract references.
- Re-review trigger: Any change to required runtime target selection.
- Verification evidence path: `docs/implementation/harness-nonwork-failure-prevention-2026-05-07/execution/05-phase-05-runtime-parity-verdict-split-v1/QA_REPORT.md`

## Verification Plan

- [ ] Syntax: `node --check .claude/scripts/verify-phase-runtime-parity.mjs && bash -n .claude/scripts/verify-phase-runtime-parity.sh && bash -n .claude/scripts/verify-phase-runtime-parity-shell-core.sh`
- [ ] Runtime parity: `bash .claude/scripts/verify-phase-runtime-parity.sh .claude/docs/runtime-parity-reference-plan`
- [ ] Verdict state compatibility: `node .claude/scripts/verification-verdict-state.mjs self-test`

## Completion Evidence

- Runtime parity command output with exercise level.
- Structured verdict excerpt showing `runtimeExerciseLevel`.
- Syntax and compatibility command output.

## Deliverables

- Runtime exercise level semantics.
- Split parity verdict output.
- Regression evidence for skipped probe behavior.

## Phase Completion Checklist

- [ ] Skipped, warning, exercised, and full states are distinct.
- [ ] Full pass is not emitted for skipped real probes.
- [ ] Existing hard failures remain hard failures.
- [ ] Verification commands pass.

## Handoff Notes

- Phase 06 must update docs/contract references if `runtimeExerciseLevel` becomes part of supported verdict schema.
