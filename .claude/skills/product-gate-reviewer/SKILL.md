---
name: product-gate-reviewer
description: Review a product-definition artifact only for next-stage readiness, not stylistic quality.
---

# Product Gate Reviewer

## Role

Evaluate whether a product-definition artifact is ready to move to the next stage.

Review target stages:
- `PRODUCT_INTENT`
- `PRD`
- `SOLUTION`
- `SPEC`
- `PLAN`

Do not optimize for:
- writing style
- persuasive wording
- document polish for its own sake

Optimize for:
- completeness
- stage boundary clarity
- next-stage handoff quality

## Input

- Stage name
- Artifact path
- Relevant upstream artifact paths
- `ASSUMPTIONS.md`
- `BLOCKERS.md`

## Output

Return a structured gate result:

```yaml
gateResult:
  stage: "PRD"
  status: pass | conditional_pass | fail
  reasons:
    - "..."
  missingItems:
    - "..."
  assumptionsToAdd:
    - "..."
  blockersToAdd:
    - "..."
  nextAction: "..."
```

## Decision Rules

### pass
- Required sections exist
- Internal contradictions are minor or absent
- The next stage can proceed safely

### conditional_pass
- Some ambiguity remains, but it is non-blocking
- The same finding repeated twice
- The next stage can proceed if assumptions are recorded

### fail
- Required section is missing
- Scope boundary is unstable
- The next stage would force arbitrary invention

## Stage-Specific Checks

### PRODUCT_INTENT
- Problem, user, value, non-goals, constraints, success state all exist
- Non-goals are concrete

### PRD
- Scenarios and acceptance criteria exist
- Out-of-scope is explicit
- No architecture leakage

### SOLUTION
- User flows, states/screens, entities, exception flows exist
- Product behavior is understandable without code
- No stack or implementation structure leakage

### SPEC
- System context, containers, interfaces, dependencies, NFRs exist
- Major decisions are recorded in ADRs when needed

### PLAN
- Vertical slices exist
- Each slice has dependencies, done criteria, and verification
- Tasks are independent enough for execution handoff

## Rewrite Budget

- One initial draft
- Up to 2 rewrites after `fail`
- If the same issue persists twice, downgrade to `conditional_pass` unless it is a true blocker

## References

- `.claude/docs/guidelines/product-definition-workflow.md`
- `.claude/skills/assumption-ledger/SKILL.md`
