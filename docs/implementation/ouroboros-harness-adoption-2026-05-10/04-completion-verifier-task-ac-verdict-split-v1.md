# Phase 04: Completion Verifier Task-vs-AC Verdict Split (v1)

## Source Mapping

| Req ID | Source Section | Requirement Summary | This Phase Handling |
|---|---|---|---|
| OHA-006 | User strategy Phase 3 | Enforce `taskStatus=completed != acVerdict=passed` | Update completion-verifier and closeout rules |
| OHA-013 | Core principles | Keep strict closeout and verifier wiring | Add violations instead of soft docs-only guidance |

## Goal

- Make completion logic explicitly distinguish implementation task completion from acceptance-criterion satisfaction.

## Expected Outcome

- A worker can finish a task while the phase remains not cleanly complete because linked AC evidence is missing or failed.
- `QA_REPORT.md`, `SCORECARD.md`, and verifier verdicts use consistent terminology for task status and AC verdict.
- Strict closeout cannot pass from task completion alone.

## Phase Execution Metadata

```yaml
phaseExecution:
  schemaVersion: 1
  parallelEligible: false
  parallelGroup: "wave-4"
  dependsOn:
    - "03"
  conflictsWith:
    - "05"
    - "06"
  ownedPaths:
    - ".claude/skills/completion-verifier/SKILL.md"
    - ".claude/scripts/verify-phase-closeout.mjs"
    - ".claude/scripts/verify-phase-closeout.test.mjs"
    - ".claude/scripts/workflow-enforcement.mjs"
    - ".claude/scripts/lib/phase-closeout-artifacts.mjs"
    - ".claude/verification.contract.yaml"
    - "docs/implementation/ouroboros-harness-adoption-2026-05-10/04-completion-verifier-task-ac-verdict-split-v1.md"
  readOnlyPaths:
    - ".claude/scripts/agent-loop-phase-artifacts.mjs"
    - ".claude/scripts/agent-loop-phase-plan-lib.mjs"
    - "docs/analysis/ouroboros-harness-adoption-inventory.md"
  sharedMutablePaths:
    - ".claude/verification.contract.yaml"
  requiresManualEvidence: false
  mergePolicy: "sequential_verifier_contract"
```

## Scope

- In scope:
  - Add completion-verifier language and gate rules for `taskStatus` vs `acVerdict`.
  - Add closeout violations for missing/failed AC verdicts when AC linkage exists.
  - Update QA/SCORECARD finish-readiness expectations.
  - Add tests for task completed with AC unknown/failed.
- Out of scope:
  - Semantic evaluation implementation.
  - Historical artifact migration.

## Preconditions and Inputs

- Phase 03 AC-linked WORKSETS structure is implemented.
- Existing closeout gate remains strict and fresh-evidence based.

## Detailed Tasks

| ID | Task | Steps | Done Criteria |
|---|---|---|---|
| P04-1 | Update verifier policy | Add task/ac split rules to completion-verifier skill | Completion guidance no longer equates task completion with acceptance |
| P04-2 | Add closeout violations | Add missing/failed AC verdict checks for completed phases | Tests fail before fix and pass after |
| P04-3 | Update workflow enforcement | Include AC verdict blockers in derived completion blockers | QA_REPORT clean_finish requires AC evidence |
| P04-4 | Update contract docs | Update verification contract artifact expectations | Required evidence paths are explicit |

## Critical Product Scenarios

| ID | User-Visible Expectation | Verification Command | Expected Signal | Evidence Path |
|---|---|---|---|---|
| SCN-P04-1 | Completed task with unknown AC verdict cannot cleanly close phase | `node --test .claude/scripts/verify-phase-closeout.test.mjs` | Test reports distinct AC verdict violation | `QA_REPORT.md` for this phase |
| SCN-P04-2 | Completed task with passing AC evidence can close when all other gates pass | `node .claude/scripts/verify-phase-closeout.mjs self-test` | Fixture reaches pass | `QA_REPORT.md` for this phase |

## Exact Execution Targets

| ID | Files To Create | Files To Modify | Files To Test | Commands | Expected Fail/Pass Signals |
|---|---|---|---|---|---|
| P04-1 | none | `.claude/skills/completion-verifier/SKILL.md` | knowledge audit | `bash .claude/scripts/knowledge-repo-audit.sh` | Errors 0 |
| P04-2 | test fixtures as needed | `.claude/scripts/verify-phase-closeout.mjs`, `.claude/scripts/verify-phase-closeout.test.mjs` | closeout tests | `node --test .claude/scripts/verify-phase-closeout.test.mjs` | Exit 0 |
| P04-3 | none | `.claude/scripts/workflow-enforcement.mjs` | workflow verify | `node --check .claude/scripts/workflow-enforcement.mjs` | Exit 0 |

## Blockers And Review

- Blocker condition: The gate blocks docs-only or operational-only tasks that intentionally have no user-facing AC.
- First review checkpoint: Review exemption rule for `operationalOnly: true` or no AC linkage.
- Re-review trigger: Any change that weakens fresh evidence or traceability requirements.
- Verification evidence path: `docs/implementation/ouroboros-harness-adoption-2026-05-10/execution/04-phase-04-completion-verifier-task-ac-verdict-split-v1/QA_REPORT.md`

## Validation Plan

- [ ] `node --check .claude/scripts/workflow-enforcement.mjs`
- [ ] `node --test .claude/scripts/verify-phase-closeout.test.mjs`
- [ ] `bash .claude/scripts/workflow-enforcement.sh verify`
- [ ] `bash .claude/scripts/knowledge-repo-audit.sh`

## Evidence to Mark Done

- Failing-then-passing test evidence for AC unknown/failed cases.
- Updated completion-verifier contract.
- Workflow-enforcement blocker output.

## Deliverables

- Completion-verifier policy update.
- Closeout verifier AC verdict split.
- Regression tests.

## Phase Completion Checklist

- [ ] `taskStatus` and `acVerdict` are separately enforced.
- [ ] Operational-only tasks have an explicit exemption path.
- [ ] QA_REPORT clean_finish requires AC evidence when AC linkage exists.
- [ ] Regression tests pass.

## Handoff Notes

- Phase 05 should write events for contract snapshots, workset status, AC verdicts, and closeout normalization.
