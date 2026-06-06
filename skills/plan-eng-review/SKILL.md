---
name: plan-eng-review
description: Review planning artifacts for architecture integrity, dependency shape, and execution readiness.
context: fork
layer: orchestrator
loads:
  - plan-artifacts
  - architecture-contracts
deepReferences:
  - docs/public/guidelines/strategy-gate-rubric.md
  - docs/public/guidelines/verification-contract.md
  - docs/public/guidelines/skill-composition.md
  - docs/public/guidelines/external-skill-pattern-transfer.md
outputArtifacts:
  - SPEC.md
  - PLAN.md
  - tasks/*.md
triggers:
  - "plan eng review"
  - "architecture review"
  - "execution readiness review"
---

# Plan ENG Review

## Role

Review a planning artifact for technical coherence before implementation begins.
Run this as an isolated plan-review boundary and merge back only the verdict summary, required changes, and blockers.

This skill checks whether the plan can be executed without hidden architectural gaps.

## Use When

- `SPEC.md` exists and implementation is near
- `PLAN.md` or `tasks/*.md` may hide unclear dependencies
- cross-layer or multi-owner work needs technical boundary review

## Review Questions

1. Are responsibilities and interfaces clear enough to implement?
2. Are dependencies and ordering explicit?
3. Are verification paths defined for the planned work?
4. Does the plan avoid hidden coupling or architecture drift?
5. For risky module/API contracts, were at least two materially different interface shapes considered?
6. Does the plan improve module depth and locality instead of adding pass-through layers?

## Applied Rubric

- reject plans that depend on major hidden invention during implementation
- require explicit ownership for boundaries, interfaces, and dependency order
- require at least one concrete verification path before returning `pass`
- downgrade the verdict when coupling is implicit or rollback risk is ignored
- use `scope_reduction` when the technical plan is coherent only after narrowing

## Verdict Contract

Return exactly one of:

- `pass`
- `conditional_pass`
- `scope_reduction`
- `hold_scope`
- `fail`

## Output Shape

```yaml
planEngReview:
  artifact: "SPEC.md"
  verdict: "conditional_pass"
  summary: "Architecture is workable, but API ownership and verification commands need clarification."
  requiredChanges:
    - "define API boundary owner"
    - "name verification command per task slice"
  blockers: []
```

## Rules

- reject plans that require major hidden invention during execution
- prefer explicit boundary ownership over implicit coordination
- if verification is undefined, do not return `pass`
- use `scope_reduction` when technical risk is caused by oversized scope
- apply the deletion test to suspicious pass-through modules
- prefer deep modules: small interface, meaningful hidden implementation, clear leverage for callers
- require domain terminology from project glossary/docs when the plan describes user-visible behavior
- downgrade the verdict when a long-lived interface has only one unexamined design shape

## Interface / Architecture Transfer Checks

Use these checks when the plan creates or changes a module, API, package boundary, workflow contract, or integration adapter:

- **Interface options**: compare at least a minimal interface, a flexible interface, and a common-case optimized interface when the contract is hard to change later.
- **Ease of use**: name how callers use the interface correctly and how they could misuse it.
- **Depth**: check whether the interface hides meaningful behavior or merely forwards calls.
- **Locality**: check whether future bugs and changes concentrate in one place.
- **Adapters**: treat a seam with only one adapter as hypothetical unless a second adapter or test double is justified.
- **ADR fit**: surface conflicts with existing ADRs only when real friction justifies revisiting the decision.

## References

- `skills/product-orchestrator/SKILL.md`
- `skills/moonshot-plan-writer/SKILL.md`
