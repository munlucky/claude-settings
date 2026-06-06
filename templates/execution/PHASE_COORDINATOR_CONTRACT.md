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
    - "Do not read or reuse .moonshot-relay/docs/phase-status.yaml, docs/implementation/**, or any other default phase-plan paths unless they exactly match the supplied paths."
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
    - "Do not write `Stop reason: clean_finish` into HANDOFF.md. Clean phase completion is phase-local evidence only and must be represented via `Required: no`, not as a plan-level stop reason."

crossRuntimeHarness:
  effort:
    defaultProfile: "standard"
    allowedProfiles:
      - economy
      - standard
      - deep
      - max
    rules:
      - "Use deep or max only when a concrete Effort escalation reason is recorded in QA_REPORT.md and workflow evidence."
      - "Provider-neutral model routing maps the shared profile to runtime-specific model and effort controls."
      - "Provider-neutral model routing must record selectedModelProvider, selectedModel, selectedModelEffort, and modelSelectionReason."
  retrievalBudget:
    default: "stage=1 compact recall; repeat only for missing owner/date/path/API/failure fact; stopWhenAnswerable=true; no raw graph or memory output"
    rules:
      - "Pass summarized projectMemoryContext only."
      - "Record summary-only CodeReviewGraph evidence; do not store raw graph output in MemoryGraph."
  validationProfile:
    default: "workflow_core"
    options:
      - prompt_only
      - docs_only
      - script_change
      - workflow_core
      - runtime_adapter
  phaseReplayPolicy:
    rules:
      - "When replaying assistant history, preserve assistant-item phase values exactly."
      - "Use commentary for progress/preamble updates and final_answer only for completed answers."
      - "Do not add phase metadata to user messages."

completionBoundary:
  rules:
    - "The only clean success boundary is active plan-directory completion: no actionable phase remains in the supplied phaseStatusFile."
    - "A completed active phase, refreshed checkpoint artifacts, or a progress summary are not valid return boundaries by themselves while another actionable phase remains."
    - "While the supplied phaseStatusFile still reports activeExecutionStatus: active, keep user-facing updates in commentary/progress form; do not emit final, closeout, or session-ended wording."
    - "If actionable phases remain, activeExecutionStatus must stay active or move to paused. Never record finished while activeActionablePhasesRemaining is greater than zero."
    - "Before returning success or a final summary, re-read the supplied phaseStatusFile and continue into the next actionable phase when one exists."
    - "If Phase 01 just became completed but Phase 02+ is still pending, in_progress, or retryable failed, treat that as a continue-now handoff: persist the updated artifacts, mark the completed phase, and immediately enter the next actionable phase instead of returning a terminal summary."
