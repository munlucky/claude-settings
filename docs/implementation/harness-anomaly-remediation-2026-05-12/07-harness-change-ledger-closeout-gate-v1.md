# Phase 07: Harness Change Ledger Closeout Gate (v1)

## Source Mapping
| Req ID | Source Section | Requirement Summary | This Phase Handling |
|--------|----------------|---------------------|---------------------|
| REQ-7.1 | User plan / Harness Change Ledger 자동 요구 | Changes under `.claude/scripts/**`, `.claude/skills/**`, or `.claude/verification.contract.yaml` require root `QA_REPORT.md` or plan package `Harness Change Ledger` at phase closeout, not commit time. | Add phase closeout gate and tests. |

## Acceptance Criteria Mapping
| AC ID | Source Requirement | Expected Evidence |
|-------|--------------------|-------------------|
| AC-13 | REQ-7.1 | Closeout fixture blocks harness file changes without ledger and passes with root/plan ledger. |

## Goal
- Move harness change documentation enforcement to phase closeout so missing ledger evidence is caught before commit closeout.

## Expected Outcome
- Any phase that modifies harness scripts, skills, or verification contract must include a Harness Change Ledger section in either root `QA_REPORT.md` or the active plan package evidence.
- Missing ledger produces a blocking diagnostic during phase closeout.

## Phase Execution Metadata
```yaml
phaseExecution:
  schemaVersion: 1
  parallelEligible: false
  parallelGroup: "wave-4"
  dependsOn:
    - "06-structured-evidence-gate-v1"
  conflictsWith: []
  ownedPaths:
    - ".claude/scripts/verify-phase-closeout.mjs"
    - ".claude/scripts/verify-phase-closeout.test.mjs"
    - ".claude/scripts/phase-final-git-closeout.mjs"
    - ".claude/scripts/phase-final-git-closeout.test.mjs"
    - ".claude/verification.contract.yaml"
    - "docs/implementation/harness-anomaly-remediation-2026-05-12/QA_REPORT.md"
  readOnlyPaths:
    - ".claude/scripts/agent-loop-phase-artifacts.mjs"
    - ".claude/scripts/lib/phase-closeout-artifacts.mjs"
  sharedMutablePaths:
    - ".claude/verification.contract.yaml"
  requiresManualEvidence: false
  mergePolicy: "sequential_patch"
```

## Scope
- In scope:
  - Detect changed paths matching `.claude/scripts/**`, `.claude/skills/**`, `.claude/verification.contract.yaml`.
  - Check for `Harness Change Ledger` in phase closeout evidence.
  - Emit blocking diagnostic at phase closeout if missing.
  - Keep commit-stage gate as secondary defense only if already present.
- Out of scope:
  - Requiring ledger for non-harness application changes.
  - Auto-generating ledger content.
  - Enforcing downstream sync.

## Preconditions and Inputs
- Required docs:
  - `docs/implementation/harness-anomaly-remediation-2026-05-12/00-master-plan-v1.md`
- Required code/data:
  - Phase 06 metadata-first closeout path is complete.
  - Git changed-file collection is available or can reuse existing closeout/git helper code.

## Detailed Tasks
| ID | Task | Steps | Done Criteria |
|----|------|-------|---------------|
| P07-1 | Detect harness changes | 1) Collect phase changed files from structured metadata, git diff, or existing artifact list. 2) Match harness path patterns. 3) Ignore runtime logs/artifacts. | Fixture identifies script/skill/contract changes only. |
| P07-2 | Check ledger presence | 1) Search root `QA_REPORT.md` and plan package QA/evidence for `Harness Change Ledger`. 2) Require non-empty entries. 3) Return structured diagnostic if absent. | Missing ledger blocks phase closeout. |
| P07-3 | Preserve commit-stage boundary | 1) Ensure phase closeout gate fails before commit closeout. 2) Keep final git closeout secondary or diagnostic-only for same issue. | Test confirms blocker appears in phase closeout path. |

## Critical Product Scenarios
| ID | User-Visible Expectation | Verification Command | Expected Signal | Evidence Path |
|----|--------------------------|----------------------|-----------------|---------------|
| SCN-07-1 | A harness script change without ledger is blocked at phase closeout. | `node --test .claude/scripts/verify-phase-closeout.test.mjs` | Closeout violation code names missing Harness Change Ledger. | `.claude/verification-results-harness-anomaly-phase07.log` |
| SCN-07-2 | A harness script change with ledger passes the ledger gate. | `node --test .claude/scripts/verify-phase-closeout.test.mjs .claude/scripts/phase-final-git-closeout.test.mjs` | Phase closeout passes ledger gate; commit gate does not introduce duplicate blocker. | `.claude/verification-results-harness-anomaly-phase07.log` |

## Exact Execution Targets
| ID | Files To Create | Files To Modify | Files To Test | Commands | Expected Fail/Pass Signals |
|----|-----------------|-----------------|---------------|----------|----------------------------|
| P07-1 | none | `.claude/scripts/verify-phase-closeout.mjs` | `.claude/scripts/verify-phase-closeout.test.mjs` | `node --test .claude/scripts/verify-phase-closeout.test.mjs` | Before: changed harness path not checked at phase closeout. After: detected. |
| P07-2 | `docs/implementation/harness-anomaly-remediation-2026-05-12/QA_REPORT.md` | `.claude/scripts/verify-phase-closeout.mjs` | `.claude/scripts/verify-phase-closeout.test.mjs` | `node --test .claude/scripts/verify-phase-closeout.test.mjs` | Before: ledger missing may surface late. After: closeout blocks early. |
| P07-3 | none | `.claude/scripts/phase-final-git-closeout.mjs` | `.claude/scripts/phase-final-git-closeout.test.mjs` | `node --test .claude/scripts/phase-final-git-closeout.test.mjs` | Before: duplicate/late blocker risk. After: phase closeout is primary. |

## Blockers And Review
- Blocker condition: changed file source cannot be determined deterministically from phase artifacts or git diff.
- First review checkpoint: path pattern allowlist is exact and does not capture runtime logs.
- Re-review trigger: adding new harness-owned directories that should require ledger.
- Verification evidence path: `.claude/verification-results-harness-anomaly-phase07.log`

## Validation Plan
- [ ] Unit: `node --test .claude/scripts/verify-phase-closeout.test.mjs`
- [ ] Unit: `node --test .claude/scripts/phase-final-git-closeout.test.mjs`
- [ ] Integration: `node --test .claude/scripts/*.test.mjs`
- [ ] Integration: `node .claude/scripts/verify-shell-syntax.mjs`

## Evidence to Mark Done
- Missing-ledger closeout fixture.
- Ledger-present closeout fixture.
- Changed file list limited to owned paths.

## Deliverables
- Phase closeout Harness Change Ledger gate.
- Minimal package `QA_REPORT.md` ledger template or evidence anchor.

## Phase Completion Checklist
- [ ] All detailed tasks meet done criteria
- [ ] Validation checks pass
- [ ] Deliverables are present and reviewed

## Handoff Notes
- This phase may modify `.claude/verification.contract.yaml`; if it does, the implementation phase itself must include a ledger entry before closeout.
