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

Before asking the user, gather available read-only context from the current repository, plan package, supplied artifacts, and installed runtime metadata. Escalate only critical ambiguity; record safe ambiguity and continue.

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
- Do not ask for information that can be confirmed from available read-only context.
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

- `docs/public/guidelines/agent-operating-policy.md`
- `docs/public/guidelines/context-relevance-policy.md`
- `docs/public/guidelines/product-definition-workflow.md`
- `<MOONSHOT_RELAY_HOME>/templates/product-definition/ASSUMPTIONS.template.md`
- `<MOONSHOT_RELAY_HOME>/templates/product-definition/BLOCKERS.template.md`
