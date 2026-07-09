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

Classify unresolved input before recording it:

| Class | Resolution rule | Artifact |
|---|---|---|
| `fact` | Resolve from source path, command output, runtime probe, public source, or structured evidence pointer. | Evidence note or path. |
| `decision` | Requires user/operator approval, accepted ADR, approved Discovery Map resolution, accepted architecture handoff, or accepted decision record. | Decision record. |
| `assumption` | Safe ambiguity that can move forward with an explicit caveat. | `ASSUMPTIONS.md`. |
| `blocker` | Missing input that would force arbitrary invention or unsafe mutation. | `BLOCKERS.md`. |

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
- Do not record a human decision as a fact.
- Do not promote an assumption into a decision without decision authority.
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
