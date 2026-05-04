---
name: assumption-ledger
description: Keep product-definition work moving by recording ambiguity as assumptions or blockers instead of stopping the workflow.
---

# Assumption Ledger

## Role

Capture unresolved ambiguity without stalling the workflow.

Write to:
- `ASSUMPTIONS.md`
- `BLOCKERS.md`

## Decision Policy

Write to `ASSUMPTIONS.md` when:
- progress is still safe
- the ambiguity affects detail, not core scope
- the next stage can proceed with an explicit note

Write to `BLOCKERS.md` when:
- the current stage cannot pass safely
- a missing dependency blocks architecture or execution planning
- continuing would force arbitrary invention on a critical decision

## Rules

- Prefer forward progress with explicit assumptions
- Keep blockers short and actionable
- Do not duplicate the same item in both files
- Update status when an assumption is resolved or a blocker is removed

## Suggested Fields

Assumption entry:
- Stage
- Assumption
- Reason
- Owner
- Status

Blocker entry:
- Stage
- Blocker
- Why it blocks
- Unblock path
- Status

## References

- `.claude/docs/guidelines/product-definition-workflow.md`
- `.claude/templates/product-definition/ASSUMPTIONS.template.md`
- `.claude/templates/product-definition/BLOCKERS.template.md`
