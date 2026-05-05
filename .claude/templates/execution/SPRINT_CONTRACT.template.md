# SPRINT CONTRACT

## Slice
- Name:
- Owner:
- Source task:
- Phase document:

## Goal
- User-visible outcome this round must deliver

## Success Criteria
- In-scope `REQ-*` and critical `SCN-*` are implemented or explicitly blocked
- Review, verification, scorecard, and handoff evidence agree before clean finish

## Constraints
- Preserve phase return boundaries, review-before-finish, verification evidence, security, and no raw MemoryGraph/CodeReviewGraph output

## Output
- Code/docs/artifacts changed this round
- Evidence paths that prove completion

## Demo-first MVP Gate
- Applies: yes | no
- Profile: none | demo_first
- Slice ID:
- Maturity target: demo_ready_ui | mock_functional_demo | demo_evidence_capture | user_demo_approval | real_functional | real_functional_verification | production_hardening
- Approval source: docs/implementation/USER_DEMO_APPROVAL.md
- Evidence source: docs/implementation/DEMO_EVIDENCE.md
- Mock contract source: docs/implementation/MOCK_API_CONTRACT.md
- Demo gate mode: hard_stop
- Backend production code allowed: yes | no

### Pre-approval allowed
- mock API contract
- typed request/response interface
- fixture schema
- mock handler
- in-memory state
- localStorage-based demo persistence
- browser/user-flow demo evidence

### Pre-approval blocked
- production DB migration
- irreversible schema decision
- real auth provider integration
- production background job
- production payment workflow
- real persistence closeout

## Stop Rules
- Continue while actionable phases remain
- Stop only on clean plan-directory completion, explicit blocker, user pause, or deferred verification handoff

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
- Model effort profile: economy | standard | deep | max (default: standard)
- Effort escalation reason: none unless model effort profile is deep|max
- Selected model provider:
- Selected model:
- Selected model effort:
- Model selection reason:
- Retrieval budget: stage=1 compact recall; repeat only for missing owner/date/path/API/failure fact; stopWhenAnswerable=true; no raw graph or memory output
- Validation profile: prompt_only | docs_only | script_change | workflow_core | runtime_adapter
- Phase replay policy: preserve assistant phase commentary/final_answer when replaying; never add phase to user items

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

## Retrieval Budget
- MemoryGraph: one compact stage recall by default; pass only summarized `projectMemoryContext`
- CodeReviewGraph: one status or impact summary per stage; record summary-only workflow evidence
- Repeat retrieval only when an owner, date, path, API/schema, or failure fact is missing

## Cross-Runtime Phase Replay
- Applies to Codex and Claude Code adapters
- Preserve assistant-item `phase` values when assistant history is replayed
- Use `commentary` for progress/preamble updates and `final_answer` only after return-boundary checks pass
- Do not add `phase` to user messages

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
