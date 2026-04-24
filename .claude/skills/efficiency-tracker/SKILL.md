---
name: efficiency-tracker
description: Tracks workflow execution and generates flow reports with actionable insights.
status: deprecated
surfaceStatus: deprecated
triggers:
  - "workflow report"
  - "workflow diagnostics"
  - "workflow insight report"
---

# Efficiency Tracker Skill

## Status

Deprecated as a default workflow component.
Keep only for explicit reporting or historical analysis until doc-ops/reporting is consolidated elsewhere.
Do not include this in default stage bundles or public entrypoint lists.

## Role
Record workflow status and generate:
- flow report (timeline, blocking, verification results, commit links)
- insight report (rule update proposals, workflow optimization recommendations)

## Inputs
- Feature name: `{feature-name}`
- Mode: `report` (default) | `generate-insights`
- Phase/branch info (optional)
- Verification command results (optional)
- **Improvement Metrics** (from failure-analyzer/workflow-self-improver):
  - `failureReport` (stats)
  - `selfImprovementResult` (applied changes)

## Behavior
### 1) `report` mode
1. Record start/end timestamps and active phase.
2. Add blocking intervals (e.g., waiting for UI spec, waiting for API spec) as notes.
3. Record verification commands (typecheck/build/lint) and results.
4. Record changed files/commit links and author notes.
5. **Log Meta-System Events**:
   - Record failure categories and counts.
   - Record system improvements applied (e.g., "Updated PROJECT.md rule").
6. Append to or create `{tasksRoot}/{feature-name}/flow-report.md`.

### 2) `generate-insights` mode
1. Load latest `flow-report.md` and recent verification outcomes.
2. Detect repeated failures by phase/category/command.
3. Convert patterns into actionable proposals:
   - rule updates (`PROJECT.md`, `.claude/rules/*`)
   - chain adjustments (`moonshot-*` runner/orchestrator)
   - verification improvements (new checks, reorder, retries)
4. Prioritize proposals by impact and effort.

## Outputs
- `flow-report.md` update log (`report` mode)
- Insight section (`generate-insights` mode) with:
  - root-cause summary
  - rule update proposals
  - workflow improvement recommendations
  - next-run experiment plan (max 3 actions)
- Optionally add timeline entries to session-log/day-...
- Optionally emit `.claude/team-metrics-<runId>.json` with:
  - `selectedPattern`
  - `selectedTeam`
  - `selectionReason`
  - `retryCount`
  - `handoffCount`
  - `indeterminateRatio`
  - `verifierFailureCategories`
  - `completionLeadTimeSeconds`

## Execution snippet
```
Update the workflow report or generate insights.
- Feature: {featureName}
- Mode: {mode}
- Phase: {phase}
- Blocking notes: {blockingNotes}
- Verification results: {verifyResults}
- Commits/files: {commitRefs}
Output: flow-report.md update or insight recommendations
```

## Token limit
- **Per `.claude/docs/guidelines/document-memory-policy.md`**: Keep flow-report.md under 4000 tokens
- Archive older entries if exceeding limit
