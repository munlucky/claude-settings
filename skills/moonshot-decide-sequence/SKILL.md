---
name: moonshot-decide-sequence
description: Determines phase and execution chain based on analysisContext (task type, complexity, signals). Use after uncertainty detection.
surfaceStatus: internal_stage_owner
---

# PM Sequence Decision

## Visibility

This is an internal analysis and routing micro-skill.
Public entry should remain at `product-orchestrator`, `moonshot-phase-runner`, or `moonshot-orchestrator`.

## Shared contracts

Use these canonical files instead of re-embedding the full contract here:
- `<MOONSHOT_RELAY_HOME>/schemas/analysis-context.schema.yaml`
- `<MOONSHOT_RELAY_HOME>/rules/workflow-bundles.yaml`

This micro-skill must consume:
- the `analysisContext` field layout and defaults from the schema file
- the bundle-selection matrix, bundle expansion map, overlays, and stage-order rules from the bundle registry

## Phase rules
1. productDefinitionRequest == true && productPackageReady == false -> planning (upstream redirect)
2. hasPendingQuestions == true -> planning
3. implementationComplete == true && (complexity == complex or (apiSpecConfirmed && hasMockImplementation)) -> integration
4. implementationComplete == true -> verification
5. planningReady == true && productPackageReady == true -> implementation
6. executionReady == true -> implementation
7. requirementsClear && hasContextMd && implementationReady -> implementation (migration fallback)
8. otherwise -> planning

Migration rule:
- During rollout, derive `planningReady` and `executionReady` from legacy signals only when the explicit `readiness.*` fields are absent.

## Bundle selection

Build the chain from bundles first, then expand into `skillChain`.
The canonical routing matrix lives in root `rules/workflow-bundles.yaml` and is installed under `<MOONSHOT_RELAY_HOME>/rules/workflow-bundles.yaml`.

Analysis micro-skills are orchestrator-internal and should not be presented as standalone workflow entrypoints.

- If `signals.productDefinitionRequest == true` and `signals.productPackageReady == false`:
  - route to `product-orchestrator`
  - do not continue into build planning or implementation
- If `signals.productPackageReady == true`:
  - treat `PLAN.md` and `tasks/*.md` as the planning baseline
  - skip `requirements-analyzer` and `context-builder`
  - validate the handoff package, then proceed to implementation
  - for medium/complex work, require execution bridge artifacts for the active slice
  - prefer `readiness.planningReady` over `hasExecutionPlan` when both exist
  - prefer `readiness.executionReady` over `implementationReady` for active slice entry

Summary:
- `read_only`: implementation bundles remain forbidden; review-only requests use `review-bundle`
- `product_project`: use the registry branch for `withProductPackage` or `withoutProductPackage`
- `meta_harness`: use the registry branch for simple vs medium/complex harness work

## Bundle expansion

Bundle expansion is defined in `<MOONSHOT_RELAY_HOME>/rules/workflow-bundles.yaml`.
Keep this skill focused on the decision logic, not the duplicated bundle contents.

Execution-bridge expectation for medium/complex `product_project` runs:
- `implementation-runner` must create or refresh `artifacts.sprintContractPath` before code edits
- verification steps must update `artifacts.qaReportPath`
- retries, pauses, or context-boundary exits must update `artifacts.handoffPath`

## Overlay rules

Resolve overlays and stage-order rules from `<MOONSHOT_RELAY_HOME>/rules/workflow-bundles.yaml`.
Minimum invariants:
- `workflowProfile == standard` keeps the base bundle chain
- `workflowProfile == strict` disables indeterminate completion and inserts the strict gates
- meaningful code changes must preserve `review -> verify -> finish`

## Plane-specific rules

Use the plane-specific rules from `<MOONSHOT_RELAY_HOME>/rules/workflow-bundles.yaml`.

## Additional rules

Apply the registry-driven additional rules from `<MOONSHOT_RELAY_HOME>/rules/workflow-bundles.yaml`, including:
- `frontend-design` insertion for React work
- `code-simplifier` insertion for non-trivial code changes
- `moonshot-phase-runner` insertion when master-plan or phase docs are detected
- `build-error-resolver` after failed verification for refactor tasks
- explicit review/verification/finish requirements for medium and complex work

## Parallel execution guide

Allowed and forbidden parallel groups are defined in `<MOONSHOT_RELAY_HOME>/rules/workflow-bundles.yaml`.

## Output (patch)

```yaml
phase: planning
decisions:
  bundleChain: []
  skillChain:
    - product-orchestrator
  recommendedAgents:
    - product-orchestrator
  parallelGroups:
    - - moonshot-evaluate-complexity
      - moonshot-detect-uncertainty
notes:
  - "phase=planning, plane=product_project, chain=product-upstream"
```

Alternate implementation-ready example:

```yaml
phase: planning
decisions:
  bundleChain:
    - ready-isolate-bundle
    - planning-bundle
  skillChain:
    - pre-flight-check
    - project-contract-gate
    - context-readiness-gate
    - verification-contract-gate
    - requirements-analyzer
    - context-builder
    - codex-validate-plan
notes:
  - "phase=planning, plane=product_project, chain=medium"
```
