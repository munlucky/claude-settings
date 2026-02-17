---
name: karpathy-execution-gate
description: Pre-implementation execution gate based on four principles (think before coding, simplicity first, surgical changes, goal-driven execution).
---

# Karpathy Execution Gate

## Role
Run a short discipline gate right before implementation to reduce over-engineering and scope drift.

## When to use
- Immediately before the first `implementation-runner` call for medium/complex tasks
- Re-run when plan assumptions or scope boundaries change

## Inputs
- `analysisContext.request`, `analysisContext.signals`, `analysisContext.estimates`
- Current plan artifacts (`context.md`, task checklist, pending questions)

## Gate steps
1. **Think Before Coding**
   - Restate target outcome and acceptance criteria in 3 lines max.
   - List explicit assumptions and unresolved blockers.
2. **Simplicity First**
   - Choose the smallest viable approach.
   - Reject optional architecture changes unless required by acceptance criteria.
3. **Surgical Changes**
   - Define in-scope files and out-of-scope areas.
   - Keep the first implementation batch minimal and reversible.
4. **Goal-Driven Execution**
   - Create a short milestone order: implement -> verify -> review.
   - Map each milestone to a concrete command or check.

## Blocking conditions
- Acceptance criteria cannot be stated clearly.
- Required assumptions are unresolved.
- Proposed diff scope is broader than user request without approval.

If blocked, return to planning and resolve blockers before coding.

## Output (patch)
```yaml
karpathyGate:
  status: pass|blocked
  targetOutcome: "..."
  acceptanceCriteria:
    - "..."
  assumptions:
    - "..."
  scope:
    inScopeFiles:
      - "src/..."
    outOfScope:
      - "infra/..."
  milestones:
    - "Implement minimal change"
    - "Run verification"
    - "Run review"
  blockers: []
notes:
  - "karpathy-gate: simplicity=pass, surgical=pass"
```

## Contract
- This gate does not implement code directly.
- Keep output concise and actionable for the next implementation step.
