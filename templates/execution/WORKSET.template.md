# WORKSET

## Goal

- Current round objective:

## In Scope Paths

- path:

## Required Reads

- file:

## Produced Artifacts

- artifact:

## Verification Commands

- command:

## Harness Runtime

- selectedHarnessComponents:
- skippedHarnessComponents:
- selectionReason:
- runtimeIsolation:
- modelEffortProfile: economy | standard | deep | max (default: standard)
- effortEscalationReason: none unless modelEffortProfile is deep|max
- selectedModelProvider:
- selectedModel:
- selectedModelEffort:
- modelSelectionReason:
- retrievalBudget: stage=1 compact recall; repeat only for missing owner/date/path/API/failure fact; stopWhenAnswerable=true; no raw graph or memory output
- validationProfile: prompt_only | docs_only | script_change | workflow_core | runtime_adapter
- phaseReplayPolicy: preserve assistant phase commentary/final_answer when replaying; never add phase to user items

## Unresolved Risks

- risk:

## Retry Strategy

- retryStrategy: same_direction_refine | partial_redesign | stop_and_handoff
- deltaHypothesis:
- repeatedFailurePolicy:

## Next Attempt Input

- use this workset together with `SPRINT_CONTRACT.md`, `QA_REPORT.md`, and `HANDOFF.md`
