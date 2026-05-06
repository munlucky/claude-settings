# Phase 01: Path Authority Fail-fast (v1)

## Source Mapping

| Req ID | Source Section | Requirement Summary | This Phase Handling |
|---|---|---|---|
| MWR-001 | WASTE_REGISTER | Path authority failures fail before worker launch | Add explicit preflight and stop reason |
| MWR-002 | WASTE_REGISTER | No default master plan fallback during phase closeout | Make closeout require supplied phase-local paths |

## Goal

- Stop `master-plan-missing` and related path authority failures before spawning implementation workers.

## Expected Outcome

- A phase run with missing or mismatched `masterPlan`, `planDir`, or `phaseStatusFile` exits with a path-authority stop reason and no worker prompt launch.

## Phase Execution Metadata

```yaml
phaseExecution:
  schemaVersion: 1
  parallelEligible: false
  parallelGroup: "wave-1"
  dependsOn: []
  conflictsWith: ["02", "03", "04", "05", "06"]
  ownedPaths:
    - ".claude/scripts/verify-phase-closeout.mjs"
    - ".claude/scripts/verify-phase-closeout.test.mjs"
    - ".claude/scripts/agent-loop-phase-runner.mjs"
    - ".claude/scripts/agent-loop.mjs"
    - ".claude/scripts/verify-phase-runner-boundary.sh"
  readOnlyPaths:
    - "docs/implementation/harness-native-awtl-rsme-2026-05-06/**"
    - "docs/implementation/harness-reliability-retro-2026-05-05/**"
  sharedMutablePaths: []
  requiresManualEvidence: false
  mergePolicy: "sequential_shared_control_plane"
```

## Scope

- In scope:
  - Add path authority preflight for master plan, status file, plan dir, execution root, and active artifact paths.
  - Make `verify-phase-closeout.mjs` distinguish missing supplied master plan from missing default fallback.
  - Add debug events for `path-authority-preflight-failed`.
- Out of scope:
  - Changing verdict parsing or coordinator lifecycle behavior.

## Preconditions and Inputs

- Required docs:
  - `docs/implementation/moonshot-harness-waste-reduction-2026-05-06/00-master-plan-v1.md`
  - `docs/implementation/moonshot-harness-waste-reduction-2026-05-06/WASTE_REGISTER.md`
- Required code/data:
  - `.claude/scripts/agent-loop-phase-runner.mjs`
  - `.claude/scripts/verify-phase-closeout.mjs`

## Detailed Tasks

| ID | Task | Steps | Done Criteria |
|---|---|---|---|
| P01-1 | Define path authority classifier | Add canonical codes for `path_authority_failure`, `master_plan_missing`, `phase_status_missing`, `plan_dir_missing`, `artifact_path_missing` | Classifier returns stable codes used by closeout and runner |
| P01-2 | Closeout strict path mode | Require explicit master plan when phase run config supplies one; remove silent default fallback for active phase closeout | Wrong default path fixture fails with `master-plan-missing` before checklist parsing |
| P01-3 | Worker preflight | Run path authority check before `worker-prompt-start` in `agent-loop-phase-runner.mjs` | Missing master plan produces no `worker-prompt-start` |
| P01-4 | Boundary regression | Extend `verify-phase-runner-boundary.sh` and closeout unit tests | Boundary verifier catches default fallback regression |

## Critical Product Scenarios

| ID | User-Visible Expectation | Verification Command | Expected Signal | Evidence Path |
|---|---|---|---|---|
| SCN-P01-1 | A bad plan path stops immediately instead of spending worker time | `bash .claude/scripts/verify-phase-runner-boundary.sh` | output includes path authority fail-fast assertion pass | `.claude/logs/agent-loop/debug.jsonl` |
| SCN-P01-2 | A valid phase-local master plan still closes out normally | `node --test .claude/scripts/verify-phase-closeout.test.mjs` | all closeout tests pass | `.claude/verification-verdict-phase01-path-authority.json` |

## Exact Execution Targets

| ID | Files To Create | Files To Modify | Files To Test | Commands | Expected Fail/Pass Signals |
|---|---|---|---|---|---|
| P01-1 | none | `.claude/scripts/verify-phase-closeout.mjs` | `.claude/scripts/verify-phase-closeout.test.mjs` | `node --test .claude/scripts/verify-phase-closeout.test.mjs` | RED: missing explicit path accepted; GREEN: missing explicit path fails |
| P01-2 | none | `.claude/scripts/agent-loop-phase-runner.mjs`, `.claude/scripts/agent-loop.mjs` | `.claude/scripts/verify-phase-runner-boundary.sh` | `bash .claude/scripts/verify-phase-runner-boundary.sh` | RED: worker starts; GREEN: fail-fast before worker |

## Blockers And Review

- Blocker condition: closeout cannot determine whether a master plan path is explicit or defaulted.
- First review checkpoint: after P01-2, review stop reason names and compatibility with existing `phase-status.yaml`.
- Re-review trigger: any change to master checklist parsing.
- Verification evidence path: `.claude/verification-verdict-phase01-path-authority.json`.

## Validation Plan

- [ ] Syntax checks: `node --check .claude/scripts/verify-phase-closeout.mjs && node --check .claude/scripts/agent-loop-phase-runner.mjs && node --check .claude/scripts/agent-loop.mjs`
- [ ] Behavior checks: `node --test .claude/scripts/verify-phase-closeout.test.mjs`
- [ ] Regression checks: `bash .claude/scripts/verify-phase-runner-boundary.sh`

## Evidence to Mark Done

- Test output showing closeout and boundary checks pass.
- Debug log example with `path-authority-preflight-failed`.
- No changes to completed implementation directories.

## Deliverables

- Path authority preflight and tests.

## Phase Completion Checklist

- [ ] Path authority failures stop before worker launch
- [ ] Valid phase-local master plan closeout still passes
- [ ] Boundary verifier covers the regression

## Handoff Notes

- Phase 02 can rely on active phase path metadata after this phase is complete.

