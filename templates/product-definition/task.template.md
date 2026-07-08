# TASK

## Summary
- Slice name
- Goal
- Requirement IDs (`REQ-*`)
- Scenario IDs (`SCN-*`)

## Input
- Source documents
- Required assets or interfaces

## Output
- Expected artifact or implementation result

## Scope
- Impacted user flow
- Impacted systems or modules

## Exact Execution Targets
- Files to create:
- Files to modify:
- Files to test:
- Commands to run:
- Expected fail/pass signals:
- Verification evidence path:

## Dependencies
- Upstream prerequisites
- Blocking conditions

## Parallelization
- Parallelizable: Yes/No
- Parallel group: G?

## Done Criteria
- Objective completion conditions
- Traceability coverage required before closeout

## Verification
- Required tests or checks
- Evidence paths or artifacts to refresh

## TDD Evidence
- Mode: red-green-refactor | bypassed
- Failing test command:
- Expected failure:
- Passing test command:
- Refactor boundary:
- Bypass reason and alternate verification, if any:

## Spec-Test Obligations Seed
- Generate one `specTestObligations` row for every detailed `REQ-*`, every `SCN-*`, and every UAT-critical item in this task.
- Behavior-changing rows default to `verificationMode: tdd_red_green`.
- Use `characterization_first` only when current brownfield behavior must be pinned before change.
- Use `evidence_mandatory` only with `requiredCommand`, `evidencePath`, and `bypassReason`.
- Populate `interface`, `depth`, and `environment` independently.

```spec-obligations
specTestObligations:
  - id: REQ-001
    source: TASK.md#REQ-001
    behaviorChanging: true
    verificationMode: tdd_red_green | characterization_first | evidence_mandatory | not_applicable
    interface: code | api | cli | ui | browser
    depth: unit | component | integration | ui_integration | e2e | broad_stack
    environment: hermetic | local | docker | preview | staging | canary
    redCommand: ""
    redEvidencePath: ""
    greenCommand: ""
    greenEvidencePath: ""
    requiredCommand: ""
    evidencePath: ""
    bypassReason: ""
    status: pending | pass | fail | not_applicable
```

## Contract Seed
- Round goal
- Explicit non-goals
- Hard fail conditions
- Evaluator focus
- Expected evidence

## Handoff Notes
- Resume point if the slice spans multiple sessions

## Rollback / Risk
- Blast radius
- Safe fallback
