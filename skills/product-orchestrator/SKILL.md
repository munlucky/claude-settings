---
name: product-orchestrator
description: Use when work is still at the idea-to-plan stage and needs bounded product-definition artifacts before implementation.
layer: orchestrator
loads:
  - product-definition-artifacts
  - verdict-summaries
deepReferences:
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

## Workflow

0. Build `projectKnowledgeContext` with `stage=intake`, `strictness=advisory`, and merge only the typed summary block/status metadata.
1. Create or refresh `PRODUCT_INTENT.md`
2. Before each reviewer/planning task, refresh `projectKnowledgeContext` for the current stage (`plan`) when the prior output changed scope, terms, or architecture.
3. Run `product-gate-reviewer` for `PRODUCT_INTENT`
4. Run `plan-ceo-review` for `PRODUCT_INTENT`
5. Create or refresh `PRD.md`
6. Run `product-gate-reviewer` for `PRD`
7. Run `plan-ceo-review` for `PRD`
8. Create or refresh `SOLUTION.md`
9. Run `product-gate-reviewer` for `SOLUTION`
10. Create or refresh `SPEC.md` and any needed `ADR/*.md`
11. Run `product-gate-reviewer` for `SPEC`
12. Run `plan-eng-review` for `SPEC`
13. Create or refresh `PLAN.md`
14. Run `task-slicer` to generate `tasks/*.md`
15. Run `product-gate-reviewer` for `PLAN`
16. Run `plan-ceo-review` for `PLAN`
17. Run `plan-eng-review` for `PLAN`
18. Hand off the plan package to `moonshot-orchestrator` with `projectKnowledgeContext`

At every stage:
- use `assumption-ledger` before stopping for ambiguity
- when work is too foggy for PRD/SPEC/PLAN readiness, create or consume a Discovery Map as an internal planning artifact before promoting decisions into product artifacts
- treat Discovery Map frontier output as advisory planning evidence only; it does not authorize execution, worker fanout, completion, or live adoption
- classify unresolved input as fact, decision, assumption, or blocker; do not self-resolve decisions that affect scope, security, data, package/runtime surface, or user-visible behavior
- gather available read-only context before asking the user unless a critical ambiguity would change scope, security, data shape, or user-visible behavior
- use `docs/public/guidelines/retrieval-and-recency-policy.md` and `docs/public/guidelines/research-evidence-policy.md` for current or volatile product, market, dependency, platform, model, pricing, legal, or security facts
- record task-relevant skill consultation through `docs/public/guidelines/skill-readiness-policy.md`
- apply `docs/public/guidelines/memorygraph-workflow.md`
- do not use `.moonshot-relay/docs/ko/` as a MemoryGraph source
- omit MemoryGraph entries that duplicate system/developer/AGENTS/rules policy
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
- Use canonical project/domain terms and flag overloaded terms before downstream planning

### SPEC
- Translate behavior into architecture
- Capture interfaces, containers, dependencies, and NFRs
- Record major choices in ADRs
- Prefer deep modules: small interfaces that hide meaningful behavior and improve locality
- For hard-to-change interfaces, consider multiple materially different shapes before choosing one
- For architecture-heavy PRDs, route through `moonshot-architecture` before final `PLAN.md`. Use the returned architecture package paths rather than rewriting architecture decisions inline.

### EXECUTION_PLAN
- Convert architecture into vertical slices
- Make every task independently executable
- Prepare for direct Moonshot handoff
- Preserve `REQ-*` and `SCN-*` mappings so completion can be blocked on uncovered items
- Narrow or reject slices whose cost is not justified by value
- Mark slices as AFK or HITL when they may become external issues or agent handoffs
- Prefer tracer-bullet vertical slices over horizontal layer batches
- For user-facing MVP work that needs direct user validation, set `mvpMethodology.profile: demo_first` and preserve the Demo Approval Hard Stop in `PLAN.md` and `tasks/*.md`.
- Demo-first plans must order each in-scope slice as `demo_ready_ui -> mock_functional_demo -> demo_evidence_capture -> user_demo_approval -> real_functional -> real_functional_verification -> production_hardening`.
- Before approval, allow mock contracts, typed fixtures, mock handlers, in-memory state, and localStorage demo persistence; block production backend, real persistence, auth integration, irreversible migrations, production jobs, and production payment workflows.
- Treat `USER_DEMO_APPROVAL.md` as the approval truth source and `DEMO_EVIDENCE.md` as the evidence source for what the user approved.

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
