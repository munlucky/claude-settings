# QA REPORT

## Slice
- Name:
- Contract:
- Evaluator:

## Verdict
- Status: pass | pass_with_warning | fail
- Summary:
- Scope status: complete | partial
- Next path: clean_finish | retry_loop | resume_later_handoff
- Closeout reason: scope_complete | verification_failed | blocked | interrupted | context_limit | user_pause | deferred_verification
- Canonical blocked path: Next path = resume_later_handoff; Closeout reason = blocked
- Release state: not_ready | uat_ready | uat_complete

## Review Checkpoint
- Review completed: yes | no
- Review owners:
- Review-driven code changes:

## TDD Evidence
- Mode: red-green-refactor | bypassed | not_applicable
- Failing test command:
- Failing test evidence:
- Passing test command:
- Passing test evidence:
- Refactor boundary observed:
- Bypass reason and alternate verification:

## Failure Loop
- Failure class:
- Root-cause evidence:
- Attempted fixes:
- Same failure class count:
- Retry strategy: same_direction_refine | partial_redesign | stop_and_handoff
- Delta hypothesis:
- Repeated failure policy:
- Next tactic:
- Escalation needed: yes | no

## Contract Review Evidence
- Contract reviewed by evaluator: yes | no | skipped_simple
- Verification owner:
- Runtime evidence plan:
- Round fail conditions:
- Contract revision required: yes | no

## Demo-first MVP Evidence
- Applies: yes | no
- Profile: none | demo_first
- Slice ID:
- Maturity target: demo_ready_ui | mock_functional_demo | demo_evidence_capture | user_demo_approval | real_functional | real_functional_verification | production_hardening
- Demo run command:
- Tested routes:
- Tested flows:
- Mock success path: pending | pass | fail
- Mock error path: pending | pass | fail
- Browser/user-flow evidence: pending | pass | fail
- Demo evidence source: docs/implementation/DEMO_EVIDENCE.md
- User approval source: docs/implementation/USER_DEMO_APPROVAL.md
- User approval status: pending | approved | rejected | invalidated
- Approved scope present: yes | no
- Mock contract source: docs/implementation/MOCK_API_CONTRACT.md
- Contract parity: pending | pass | fail
- Evidence mode: mock_only | real_api | mixed | pending
- Mock-only evidence: yes | no
- UI change request source: docs/implementation/UI_CHANGE_REQUEST.md
- UI approval invalidated: yes | no

## Frontend Evidence
- Applies: yes | no
- Required by: sprint_contract | source_phase | scenario_matrix | verification_contract | critical_scenario_policy | not_required
- Release state separation: not_ready | uat_ready | uat_complete
- Runtime flow depth: smoke | open-act-mutate-persist-recover | not_applicable
- Visual evidence: not_required | pending | pass | fail
- Visual evidence paths:
- Accessibility evidence: not_required | pending | pass | fail
- Accessibility evidence paths:
- Performance evidence: not_required | pending | pass | fail
- Performance evidence paths:
- Setup gaps:
- Blocking setup gaps: none unless a required frontend evidence type cannot be produced
- Smoke-only critical scenario warning: none | present
- Remediation required before clean finish:

## Criteria Review
| Criterion | Result | Notes |
|-----------|--------|-------|
|  | pass/fail/warn |  |

## Plan Conformance Review
| Plan Item | Required | Actual | Result | Required Action |
|-----------|----------|--------|--------|-----------------|
| Source plan snapshot preserved | Source `Goal`, `Expected Outcome`, `Scope`, `Detailed Tasks`, and `Exact Execution Targets` remain binding |  | pass/fail/warn |  |
| Exact execution targets satisfied | Required files, dependencies, and expected signals from the source phase doc are implemented or explicitly user-approved replan exists |  | pass/fail/warn |  |
| Spec deviation ledger clean | No unapproved delete/substitute/defer decisions |  | pass/fail/warn |  |

## Traceability Coverage
| Item | Result | Notes |
|------|--------|-------|
| In-scope `REQ-*` covered | pass/fail/warn |  |
| Critical `SCN-*` evidenced | pass/fail/warn |  |
| UAT prerequisites complete | pass/fail/warn |  |
| Evidence row format | pass/fail/warn | `SCN-ID | pass | evidence path` is accepted |

## Workflow Surface Coverage
Use when the task changes harness, workflow docs, skill metadata, or public entrypoint guidance.

| Item | Result | Notes |
|------|--------|-------|
| Public entrypoint policy preserved | pass/fail/warn |  |
| Deprecated assets remain non-default | pass/fail/warn |  |
| Internal and optional bundle members are not advertised as default workflow entrypoints | pass/fail/warn |  |
| Stage map remains complete | pass/fail/warn |  |

## Workflow Execution
- Selected bundles:
- Applied skills:
- Skipped skills:
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

## Uncovered Items
| ID | Type | Gap | Next Action |
|----|------|-----|-------------|
|  | REQ/SCN/UAT |  |  |

## Findings
| Severity | Area | Reproduction | Expected | Actual |
|----------|------|--------------|----------|--------|
|  |  |  |  |  |

## Runtime Updates
- Verification verdict file: .claude/verification-verdict-phaseNN-final.json
- Verification verdict: pending

## Evidence
- Commands run:
- Runtime flow exercised:
- Runtime evidence depth: smoke | open-act-mutate-persist-recover
- Critical scenario smoke-only warning:
- Logs/screenshots/artifacts:
- Scorecard artifact:
- Requirements traceability artifact:
- Scenario matrix artifact:
- UAT checklist artifact:

## Score Summary
- Current score:
- Target score:
- Unmet checklist items:
- Blocking defects:
- Score verdict: retry | blocked | done
- Task-level status: FULL | PARTIAL | NO

## Finish Readiness
- Fresh evidence confirmed:
- Traceability evidence confirmed:
- Source plan conformance confirmed:
- Human UAT sign-off present:
- Why this round may stop now: concrete closeout reason only, never placeholder text
- Remaining in-scope work: use `none` only when the phase truly closes
- Remaining blockers before closeout: use `none` only when closeout is actually clean
- Checks to rerun if code changes again:

## Next Round Input
- Must fix before merge
- Can defer with note
- Suggested follow-up checks
