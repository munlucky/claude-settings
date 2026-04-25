runtimeCompatibility:
  fallback: "If /moonshot-in-session-coordinator is unavailable in this runtime, execute the equivalent coordinator contract directly without searching for missing slash skills."

pathAuthority:
  phaseStatusFile: "{{PHASE_STATUS_FILE}}"
  planDir: "{{PLAN_DIR}}"
  executionRoot: "{{EXECUTION_ROOT}}"
  activeArtifacts:
    sprintContract: "{{ACTIVE_SPRINT_CONTRACT}}"
    qaReport: "{{ACTIVE_QA_REPORT}}"
    handoff: "{{ACTIVE_HANDOFF}}"
    scorecard: "{{ACTIVE_SCORECARD}}"
  rules:
    - "Treat the supplied phaseStatusFile, planDir, executionRoot, and referenced execution artifact paths as authoritative for this run."
    - "Do not read or reuse .claude/docs/phase-status.yaml, docs/implementation/**, or any other default phase-plan paths unless they exactly match the supplied paths."
    - "If examples in skill docs conflict with the supplied paths, ignore the examples and follow the supplied paths."

stageContract:
  defaultOrder:
    - ready/isolate
    - execute
    - review
    - verify
    - finish/handoff
  rules:
    - "Before broad repo inspection or long-running work, write an attempt-started checkpoint to the active phase QA_REPORT.md and SCORECARD.md and mark the supplied phaseStatusFile in progress for the active phase."
    - "Do not skip review for meaningful code changes without recording why."
    - "Do not enter finish/handoff until the active review and verification verdict is stable."
    - "Use the seeded execution artifacts as the source of truth for review cadence and closeout state."
    - "Refresh QA_REPORT.md and SCORECARD.md at stage transitions instead of batching all artifact updates until the very end."
    - "In QA_REPORT.md, use only these closeout reason codes: scope_complete, verification_failed, blocked, interrupted, context_limit, user_pause, deferred_verification. If Next path is retry_loop, Closeout reason must be verification_failed."
    - "In HANDOFF.md, use only these stop reason codes: blocked, interrupted, context_limit, user_pause, deferred_verification."

completionBoundary:
  rules:
    - "The only clean success boundary is active plan-directory completion: no actionable phase remains in the supplied phaseStatusFile."
    - "A completed active phase, refreshed checkpoint artifacts, or a progress summary are not valid return boundaries by themselves while another actionable phase remains."
    - "While the supplied phaseStatusFile still reports activeExecutionStatus: active, keep user-facing updates in commentary/progress form; do not emit final, closeout, or session-ended wording."
    - "Before returning success or a final summary, re-read the supplied phaseStatusFile and continue into the next actionable phase when one exists."
    - "If Phase 01 just became completed but Phase 02+ is still pending, in_progress, or retryable failed, treat that as a continue-now handoff: persist the updated artifacts, mark the completed phase, and immediately enter the next actionable phase instead of returning a terminal summary."
