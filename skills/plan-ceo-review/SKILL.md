---
name: plan-ceo-review
description: Review planning artifacts for product value, timing, and scope control before execution.
context: fork
layer: orchestrator
loads:
  - product-artifacts
  - decision-verdict-only
deepReferences:
  - docs/public/guidelines/strategy-gate-rubric.md
  - docs/public/guidelines/product-definition-workflow.md
outputArtifacts:
  - PRODUCT_INTENT.md
  - PRD.md
  - PLAN.md
  - ASSUMPTIONS.md
  - BLOCKERS.md
triggers:
  - "plan ceo review"
  - "scope review"
  - "value review"
---

# Plan CEO Review

## Role

Review a planning artifact for product value and scope discipline before execution begins.
Run this as an isolated plan-review boundary and merge back only the verdict summary and required changes.

This skill does not rewrite the whole plan by default.
It produces a decision verdict that upstream planning stages must respect.

## Use When

- a plan looks complete but may still be too large
- the package needs a value or timing judgment
- scope may need to be reduced before implementation

## Inputs

- one planning artifact at a time:
  - `PRODUCT_INTENT.md`
  - `PRD.md`
  - `PLAN.md`
- optional supporting context:
  - `ASSUMPTIONS.md`
  - `BLOCKERS.md`
  - `SPEC.md`

## Review Questions

1. Why should this work happen now?
2. What is explicitly out of scope?
3. Is the likely implementation cost justified by the user value?
4. Should scope be reduced, held, or rejected before execution?

## Applied Rubric

- require a clear why-now argument, not only a complete artifact
- require explicit non-goals and a core success state
- prefer narrowing to the highest-value user path when value is uncertain
- treat observability, rollout risk, and support burden as part of scope cost
- if value is weak even after narrowing, return `hold_scope` or `fail`

## Verdict Contract

Return exactly one of:

- `pass`
- `conditional_pass`
- `scope_reduction`
- `hold_scope`
- `fail`

## Output Shape

```yaml
planCeoReview:
  artifact: "PLAN.md"
  verdict: "scope_reduction"
  summary: "Current phase list is broader than the near-term value case."
  requiredChanges:
    - "split admin analytics into a later slice"
  assumptions:
    - "Current run targets only core user path"
  blockers: []
```

## Rules

- prefer scope reduction over speculative expansion
- do not treat completeness as value
- if value is weak or timing is poor, use `hold_scope` or `fail`
- if details are missing but not critical, use `conditional_pass`

## References

- `.claude/skills/product-orchestrator/SKILL.md`
- `.claude/skills/moonshot-plan-writer/SKILL.md`
