# Phase 03 - Observability Contract Fields v1

## Purpose

Split team metrics into decision-critical fields and reporting fields while preserving the existing `requiredFields` contract for compatibility.

## Execution Metadata

```yaml
phase: 03
title: Observability Contract Fields
dependsOn:
  - 02-runtime-error-classifier-v1
conflictsWith: []
ownedPaths:
  - schemas/verification.contract.yaml
  - docs/public/runtime-control-plane.md
  - docs/public/guidelines/verification-contract.md
  - tests/runtime-read-model-contract.test.mjs
  - tests/observability-metrics-contract.test.mjs
readOnlyPaths:
  - scripts/runtime-state.mjs
  - scripts/lib/runtime-state-store.mjs
  - scripts/lib/verification-plane.mjs
sharedMutablePaths:
  - schemas/verification.contract.yaml
adoptionTargets: []
liveMutationPolicy: source_only
```

## Implementation Contract

Do not remove `observability.teamMetrics.requiredFields`. Mark it as deprecated compatibility in source comments or public documentation.

Add:

- `observability.teamMetrics.decisionFields`
- `observability.teamMetrics.reportingFields`

`decisionFields` must contain:

- `selectedPattern`
- `selectedHarnessComponents`
- `skippedHarnessComponents`
- `runtimeIsolation`
- `verifierFailureCategories`

`reportingFields` must contain:

- `selectedTeam`
- `selectionReason`
- `modelEffortProfile`
- `selectedModelProvider`
- `selectedModel`
- `selectedModelEffort`
- `modelSelectionReason`
- `retryCount`
- `handoffCount`
- `indeterminateRatio`
- `completionLeadTimeSeconds`

Do not change:

- `observability.runtimeStatusReadModel.requiredFields`
- `observability.contextStateReadModel.requiredFields`

## Acceptance Criteria

- Existing consumers that read `teamMetrics.requiredFields` still pass.
- New contract tests assert non-empty `decisionFields` and `reportingFields`.
- Documentation states that decision fields are for routing/completion/blocker authority, while reporting fields are for metrics and diagnostics.

## Verification

```powershell
node --test tests/runtime-read-model-contract.test.mjs tests/observability-metrics-contract.test.mjs
npm run test:eval
```
