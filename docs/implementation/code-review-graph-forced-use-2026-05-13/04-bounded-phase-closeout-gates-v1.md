# Phase 04 - Bounded and Phase Closeout Gates

```yaml
phaseExecution:
  schemaVersion: 1
  parallelEligible: false
  parallelGroup: "sequential"
  dependsOn: ["03-validator-parity-and-resolver-v1.md"]
  conflictsWith: []
  ownedPaths:
    - ".claude/scripts/workflow-enforcement.mjs"
    - ".claude/agents/verification/verify-changes.sh"
    - ".claude/agents/verification/build-verdict-json.py"
    - ".claude/scripts/agent-loop-phase-artifacts.mjs"
    - ".claude/scripts/agent-loop-phase-state.mjs"
    - ".claude/scripts/verify-phase-closeout.mjs"
  readOnlyPaths:
    - ".claude/scripts/verify-phase-closeout-fixtures.mjs"
    - ".claude/scripts/verify-phase-closeout.test.mjs"
  sharedMutablePaths: []
  requiresManualEvidence: false
  mergePolicy: "sequential_closeout_gate"
```

## Goal
Connect the shared CRG validator to every bounded, verification, phase, and plan closeout path.

## Gate Changes
- `workflow-enforcement.mjs`
  - Replace hardcoded suffix Set with shared suffix helper.
  - Validate bounded `analysisContext.codeReviewGraph` and `workflowEvidence`.
  - Block strict code-changing work when CRG is missing, invalid, unavailable, or missing required stage coverage.
- `verify-changes.sh` and `build-verdict-json.py`
  - Delegate CRG decision to Python helper.
  - Record validator output in verdict JSON as a mirror.
  - Do not let verdict mirror become phase source of truth.
- `agent-loop-phase-artifacts.mjs`
  - Preserve or upsert exactly one CRG marker JSON block in `QA_REPORT.md`.
  - Never erase CRG block when rewriting `Workflow Execution`.
- `agent-loop-phase-state.mjs`
  - Parse QA marker block through shared parser.
  - Use validator result to block clean finish.
- `verify-phase-closeout.mjs`
  - Use the same validator and changedFiles resolver.
  - Block plan-level closeout when completed strict phases only contain legacy/string evidence.

## Profile Semantics
- `prompt_only` and `docs_only`: CRG missing may warn.
- `script_change`, `workflow_core`, `runtime_adapter`, `strict`: CRG missing, invalid skip, invalid artifact, or `tool_unavailable:*` blocks code-changing clean finish.
- `tool_unavailable:lock_timeout`: retryable blocker.
- `tool_unavailable:command_not_found`, `base_ref_unavailable`: non-retryable blocker.
- `tool_unavailable:qa_report_missing`: carrier/config blocker.

## Acceptance Criteria
- `AC-06`: duplicate, malformed, or legacy-only QA CRG evidence fails strict gate.
- `AC-07`: `verify-phase-closeout` cannot pass strict code changes without structured CRG evidence.
- `AC-13`: `agent-loop-phase-artifacts.mjs` preserves CRG marker block during Workflow Execution rewrite.

## Verification
```bash
bash .claude/scripts/workflow-enforcement.sh verify
bash .claude/scripts/verify-phase-runner-boundary.sh
node --test .claude/scripts/verify-phase-closeout.test.mjs
```

## Blockers
- Stop if any closeout path keeps a separate CRG rule implementation instead of calling the shared validator.

