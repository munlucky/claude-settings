---
name: product-orchestrator
description: Use when work is still at the idea-to-plan stage and needs bounded product-definition artifacts before implementation.
layer: orchestrator
loads:
  - product-definition-artifacts
  - verdict-summaries
deepReferences:
  - .claude/docs/guidelines/product-definition-workflow.md
  - .claude/docs/guidelines/requirements-traceability-harness.md
outputArtifacts:
  - PRODUCT_INTENT.md
  - PRD.md
  - SOLUTION.md
  - SPEC.md
  - PLAN.md
triggers:
  - "product orchestrator"
  - "product definition"
  - "intent to prd"
  - "idea to plan"
---

# Product Orchestrator

## Role

Run the product-definition workflow before code-oriented Moonshot execution.

This is the default public entrypoint for the Intake stage when the request is still shaping product scope.

This skill is explicitly for:
- idea to product intent
- product intent to PRD
- PRD to product behavior model
- behavior model to architecture
- architecture to execution slices

This skill is not for:
- market validation
- user interview automation
- MVP experiment pipelines
- shipping code directly

## Output Package

Write artifacts under:
- `{tasksRoot}/{feature-name}/product/`

Required outputs:
- `PRODUCT_INTENT.md`
- `PRD.md`
- `SOLUTION.md`
- `SPEC.md`
- `ADR/*.md`
- `PLAN.md`
- `tasks/*.md`
- `ASSUMPTIONS.md`
- `BLOCKERS.md`
- `execution/REQUIREMENTS_TRACEABILITY.md` when document-trace completion is required
- `execution/SCENARIO_MATRIX.md` when user-visible flows matter
- `execution/UAT_CHECKLIST.md` when the target is UAT-ready handoff

Planning artifacts should also record:
- explicit non-goals
- scope reduction or scope hold notes when requests are too large
- a short cost/benefit rationale at `PRODUCT_INTENT`, `PRD`, and `PLAN`

## Workflow

1. Create or refresh `PRODUCT_INTENT.md`
2. Run `product-gate-reviewer` for `PRODUCT_INTENT`
3. Run `plan-ceo-review` for `PRODUCT_INTENT`
4. Create or refresh `PRD.md`
5. Run `product-gate-reviewer` for `PRD`
6. Run `plan-ceo-review` for `PRD`
7. Create or refresh `SOLUTION.md`
8. Run `product-gate-reviewer` for `SOLUTION`
9. Create or refresh `SPEC.md` and any needed `ADR/*.md`
10. Run `product-gate-reviewer` for `SPEC`
11. Run `plan-eng-review` for `SPEC`
12. Create or refresh `PLAN.md`
13. Run `task-slicer` to generate `tasks/*.md`
14. Run `product-gate-reviewer` for `PLAN`
15. Run `plan-ceo-review` for `PLAN`
16. Run `plan-eng-review` for `PLAN`
17. Hand off the plan package to `moonshot-orchestrator`

At every stage:
- use `assumption-ledger` before stopping for ambiguity
- stop only for true blockers
- use max 2 rewrite retries after the first draft
- prefer scope reduction over speculative expansion when value is weak or unclear

## Gate Policy

Every stage ends with one of:
- `pass`: ready for the next stage
- `conditional_pass`: acceptable with explicit assumptions or follow-up notes
- `fail`: rewrite the current stage

Escalation rules:
- Same issue repeated twice -> `conditional_pass`
- Missing but non-critical detail -> add to `ASSUMPTIONS.md`
- Hard dependency missing -> add to `BLOCKERS.md`
- Weak value or poor cost/benefit -> reduce scope, hold scope, or fail the stage

## Value Judgment Policy

Do not treat completeness as sufficient.

Before execution handoff, the planning package should answer:
- why the work matters now
- what will not be built
- whether the benefit is large enough for the likely implementation cost
- whether the current scope should be reduced before execution

Preferred actions:
- `scope_reduction`
- `hold_scope`
- `fail`

## Stage Summary

### PRODUCT_INTENT
- Bound the problem
- Name the user
- State the core value
- Freeze non-goals
- Record why now

### PRD
- Define scenarios and acceptance
- Keep the document product-facing
- Do not introduce architecture
- Assign stable `REQ-*` and `SCN-*` identifiers for downstream traceability
- Prioritize features by value

### SOLUTION
- Model flows, state, entities, and exceptions
- Do not discuss stack, classes, or modules

### SPEC
- Translate behavior into architecture
- Capture interfaces, containers, dependencies, and NFRs
- Record major choices in ADRs

### EXECUTION_PLAN
- Convert architecture into vertical slices
- Make every task independently executable
- Prepare for direct Moonshot handoff
- Preserve `REQ-*` and `SCN-*` mappings so completion can be blocked on uncovered items
- Narrow or reject slices whose cost is not justified by value

## Approval Boundary

- Human approval may be used to accept the planning package before execution begins.
- After execution begins, implementation -> review -> verify -> retry loops should continue without additional human checkpoints unless a true blocker or external dependency appears.

## Handoff Contract

When the plan passes:
- provide document paths, not full inline content
- summarize assumptions and blockers
- hand `tasks/*.md` to the implementation-oriented workflow

Recommended next step:
- `/moonshot-orchestrator` with the generated product package

## References

- `.claude/docs/guidelines/product-definition-workflow.md`
- `.claude/templates/product-definition/`
- `.claude/skills/product-gate-reviewer/SKILL.md`
- `.claude/skills/plan-ceo-review/SKILL.md`
- `.claude/skills/plan-eng-review/SKILL.md`
- `.claude/skills/task-slicer/SKILL.md`
- `.claude/skills/assumption-ledger/SKILL.md`
- `.claude/skills/moonshot-orchestrator/SKILL.md`
