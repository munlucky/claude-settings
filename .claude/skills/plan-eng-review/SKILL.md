---
name: plan-eng-review
description: Review planning artifacts for architecture integrity, dependency shape, and execution readiness.
layer: orchestrator
loads:
  - plan-artifacts
  - architecture-contracts
deepReferences:
  - .claude/docs/guidelines/strategy-gate-rubric.md
  - .claude/docs/guidelines/verification-contract.md
  - .claude/docs/guidelines/skill-composition.md
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

## References

- `.claude/skills/product-orchestrator/SKILL.md`
- `.claude/skills/moonshot-plan-writer/SKILL.md`
