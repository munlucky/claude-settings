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
- Release state: not_ready | uat_ready | uat_complete

## Review Checkpoint
- Review completed: yes | no
- Review owners:
- Review-driven code changes:

## Criteria Review
| Criterion | Result | Notes |
|-----------|--------|-------|
|  | pass/fail/warn |  |

## Traceability Coverage
| Item | Result | Notes |
|------|--------|-------|
| In-scope `REQ-*` covered | pass/fail/warn |  |
| Critical `SCN-*` evidenced | pass/fail/warn |  |
| UAT prerequisites complete | pass/fail/warn |  |

## Workflow Surface Coverage
Use when the task changes harness, workflow docs, skill metadata, or public entrypoint guidance.

| Item | Result | Notes |
|------|--------|-------|
| Public entrypoint policy preserved | pass/fail/warn |  |
| Deprecated assets remain non-default | pass/fail/warn |  |
| Internal and optional bundle members are not advertised as default workflow entrypoints | pass/fail/warn |  |
| Stage map remains complete | pass/fail/warn |  |

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

## Finish Readiness
- Fresh evidence confirmed:
- Traceability evidence confirmed:
- Human UAT sign-off present:
- Why this round may stop now: concrete closeout reason only, never placeholder text
- Remaining in-scope work: use `none` only when the phase truly closes
- Remaining blockers before closeout: use `none` only when closeout is actually clean
- Checks to rerun if code changes again:

## Next Round Input
- Must fix before merge
- Can defer with note
- Suggested follow-up checks
