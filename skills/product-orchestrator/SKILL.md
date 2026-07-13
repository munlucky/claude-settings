---
name: product-orchestrator
description: Use when work is still at the idea-to-plan stage and needs bounded product-definition artifacts before implementation.
policyClauseIds:
  - product-orchestrator.policy.use-when
  - product-orchestrator.policy.routing
  - product-orchestrator.policy.hard-stops
  - product-orchestrator.policy.output-contract
policyDigest: cb67114d85778a5895df11db58bf7be43f0342526888a0be510798f0c85bddfc
layer: orchestrator
loads:
  - product-definition-artifacts
  - verdict-summaries
deepReferences:
  - references/compatibility-contract.md
  - docs/public/guidelines/product-definition-workflow.md
  - docs/public/guidelines/requirements-traceability-harness.md
  - docs/public/guidelines/demo-first-mvp-gate.md
  - docs/public/guidelines/external-skill-pattern-transfer.md
  - docs/public/guidelines/memorygraph-workflow.md
  - docs/public/guidelines/agent-operating-policy.md
  - docs/public/guidelines/retrieval-and-recency-policy.md
  - docs/public/guidelines/context-relevance-policy.md
  - docs/public/guidelines/research-evidence-policy.md
  - docs/public/guidelines/skill-readiness-policy.md
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

## Use When

Use while an idea still needs bounded product definition before architecture or implementation.

## Route Away

Use `moonshot-architecture` after product approval and `moonshot-orchestrator` only for bounded implementation-ready work.

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

It may prepare a `demo_first` MVP execution pack. That pack is a planning and execution contract, not a market experiment runner.

## Output Contract

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

Conditional demo-first MVP outputs:
- `MVP_SCOPE.md`
- `MINI_ARCHITECTURE.md`
- `UI_DEMO_PLAN.md`
- `UI_FLOW_MAP.md`
- `UI_STATE_MATRIX.md`
- `MOCK_SCENARIOS.md`
- `MOCK_API_CONTRACT.md`
- `USER_DEMO_TEST.md`
- `DEMO_EVIDENCE.md`
- `USER_DEMO_APPROVAL.md`
- `POST_DEMO_IMPLEMENTATION_PLAN.md`
- `UI_CHANGE_REQUEST.md`

Planning artifacts should also record:
- explicit non-goals
- scope reduction or scope hold notes when requests are too large
- a short cost/benefit rationale at `PRODUCT_INTENT`, `PRD`, and `PLAN`
- canonical domain terms or glossary gaps when language is ambiguous
- testing decisions focused on user-visible behavior, not implementation details

## Procedure

1. Build compact intake/plan knowledge context and classify facts, decisions, assumptions, and blockers.
1.1. classify unresolved input as fact, decision, assumption, or blocker; do not self-resolve decisions affecting scope, security, data, package/runtime surface, or user-visible behavior.
2. Draft `PRODUCT_INTENT.md`, `PRD.md`, `SOLUTION.md`, `SPEC.md`, and `PLAN.md` in order.
3. Run the product gate at every stage; add CEO review for intent, PRD, and plan, plus engineering review for spec and plan.
4. Use Discovery Map and current-fact references only when needed; they remain advisory and never authorize execution.
4.1. Record task-relevant consultation through `docs/public/guidelines/skill-readiness-policy.md`.
5. Slice accepted planning into tasks, retry a weak draft at most twice, and reduce scope when value is unclear.
6. Hand the approved package and compact context to the appropriate execution entrypoint.
6.1. Route architecture-heavy PRDs through `moonshot-architecture`, then preserve `REQUIREMENT_INVENTORY.md`, `TRACEABILITY_MATRIX.md`, and `ARCHITECTURE_REVIEW.md` for `moonshot-orchestrator` or `moonshot-phase-runner` handoff.

## Hard Stops

Every stage ends with one of:
- `pass`: ready for the next stage
- `conditional_pass`: acceptable with explicit assumptions or follow-up notes
- `fail`: rewrite the current stage

Escalation rules:
- Same issue repeated twice -> `conditional_pass`
- Missing but non-critical detail -> add to `ASSUMPTIONS.md`
- Hard dependency missing -> add to `BLOCKERS.md`
- Weak value or poor cost/benefit -> reduce scope, hold scope, or fail the stage

Stage-specific detail, value tests, and demo-first sequencing are conditional references in `docs/public/guidelines/product-definition-workflow.md` and `docs/public/guidelines/demo-first-mvp-gate.md`.

## Approval Boundary

- Human approval may be used to accept the planning package before execution begins.
- After execution begins, implementation -> review -> verify -> retry loops should continue without additional human checkpoints unless a true blocker or external dependency appears.
- Exception: `demo_first` MVP work must hard-stop after Mock Functional Demo evidence until `USER_DEMO_APPROVAL.md` is approved with non-empty approved scope.

## Handoff Contract

When the plan passes:
- provide document paths, not full inline content
- summarize assumptions and blockers
- include architecture package paths when `moonshot-architecture` was used: `REQUIREMENT_INVENTORY.md`, `ASR_CATALOG.md`, `TRACEABILITY_MATRIX.md`, selected `ADR/*.md`, and `ARCHITECTURE_REVIEW.md`
- hand `tasks/*.md` to the implementation-oriented workflow
- route bounded implementation to `moonshot-orchestrator`; route multi-phase, staged adoption, or long-running packages to `moonshot-phase-runner`

Recommended next step:
- `/moonshot-orchestrator` with the generated product package

## References

- `docs/public/guidelines/product-definition-workflow.md`
- `docs/public/guidelines/demo-first-mvp-gate.md`
- `docs/public/guidelines/retrieval-and-recency-policy.md`
- `templates/product-definition/DISCOVERY_MAP.template.md`
- `templates/product-definition/DISCOVERY_TICKET.template.md`
- `schemas/discovery-map.schema.json`
- `docs/public/guidelines/skill-readiness-policy.md`
- `<MOONSHOT_RELAY_HOME>/templates/product-definition/`
- `skills/product-gate-reviewer/SKILL.md`
- `skills/plan-ceo-review/SKILL.md`
- `skills/plan-eng-review/SKILL.md`
- `skills/task-slicer/SKILL.md`
- `skills/assumption-ledger/SKILL.md`
- `skills/moonshot-orchestrator/SKILL.md`

## Project Knowledge Context Contract

Product-definition work uses advisory `projectKnowledgeContext` with `stage=intake` or `stage=plan` before plan-package prompt assembly. The context is a compact recall source, not an enforcement source.

If the helper is unavailable, continue with degraded advisory metadata unless the user explicitly requested a strict memory task. Do not inline raw MemoryGraph/KG/ontology records, logs, transcripts, or secrets into product prompts or plan artifacts.
