# SPRINT CONTRACT

## Slice
- Name:
- Owner:
- Source task:
- Phase document:

## Round Goal
- What this round must deliver in user-visible terms

## Source Plan Requirements Snapshot
- Source phase doc:
- Goal:
- Expected outcome:
- Scope in:
- Detailed tasks:
- Exact execution targets:
- Expected signals:
- Rule: this snapshot is copied from the source phase plan and must not be weakened during execution.

## Spec Deviation Ledger
| Plan Item | Planned Requirement | Actual / Proposed Change | Approval | Completion Impact | Required Action |
|-----------|---------------------|--------------------------|----------|-------------------|-----------------|
| none | none | none | none | none | none |

## In-Scope Traceability
- Requirement IDs (`REQ-*`):
- Critical scenarios (`SCN-*`):
- UAT-critical checks covered this round:

## Non-Goals
- What this round will not attempt

## Stage Order
- Ready / Isolate
- Execute
- Review
- Verify
- Finish / Handoff

## Harness Selection
- Selected harness components:
- Skipped harness components:
- Selection reason:
- Runtime isolation:
- Model effort profile: economy | standard | deep | max

## Planned Changes
- Main implementation areas
- Expected files or modules

## Exact Execution Targets
- Files to create:
- Files to modify:
- Files to test:
- Commands to run:
- Expected fail/pass signals:
- Blocker condition:
- Review checkpoint:
- Verification evidence path:

## TDD Contract
- Applies: yes | no
- Failing test command:
- Expected failure:
- Passing test command:
- Refactor boundary:
- Bypass reason if test-first is infeasible:
- Alternate verification path:

## Contract Review
- Contract reviewed by evaluator: yes | no | skipped_simple
- Verification owner:
- Runtime evidence plan:
- Round fail conditions:
- Contract revision required: yes | no
- Review notes:

## Policy Anchors
- Always-loaded rules:
- Active workspace contract:
- Verification contract:
- Phase-specific guides:
- Round policy summary:

## Review Cadence
- First review checkpoint:
- Re-review trigger:
- Review owners:

## Done Checks
| Check | Type | Pass Condition |
|-------|------|----------------|
|  | UI/API/Test |  |

## Traceability Exit Criteria
| ID | Type | Verification Path | Evidence Required |
|----|------|-------------------|-------------------|
|  | REQ/SCN/UAT | unit/integration/e2e/manual |  |

## Evaluator Focus
- Edge cases to probe
- Flows most likely to regress
- Areas where stub behavior is unacceptable

## Evidence
- Required commands:
- Runtime flow:
- Runtime evidence depth: smoke | open-act-mutate-persist-recover
- Critical SCN runtime gate: smoke-only is warning; deep interaction is required for clean finish
- Screenshots/logs:
- Requirements traceability update:
- Scenario matrix update:
- UAT checklist state:

## Finish Rule
- Clean finish requires:
- Source plan conformance: required; unapproved deviations force `retry_loop`
- Continue-now rule: if in-scope work remains and no real stop condition exists, do not stop on checkpoint evidence alone
- Resume-later handoff trigger:
- Retry-loop trigger:
- Target completion score:

## Risks
- Known uncertainty
- Rollback or safe fallback

## Workspace Prepare / Baseline
- Branch or worktree:
- Worktree ignore checked:
- Worktree path ignored:
- Agent config source:
- Ignored agent paths (`.claude/.agents/.codex`):
- Hydrated agent config: yes | no | not needed
- Prepare command:
- Prepare artifact (`.claude/worktree-prepare.json`):
- Setup command:
- Baseline verification command:
- Baseline exit code:
- Baseline artifact:
