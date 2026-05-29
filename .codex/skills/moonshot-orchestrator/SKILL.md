---
name: moonshot-orchestrator
description: Use for bounded implementation work that already has enough context and does not need the phase harness.
triggers:
  - "moonshot orchestrator"
  - "bounded implementation"
  - "implement this"
deepReferences:
  - references/bounded-flow.md
  - references/review-and-verification.md
---

# Moonshot Orchestrator

## Role

Run a bounded implementation slice when the work has enough context and does not need the phase runner. Keep the current session as the owner, execute surgically, and prove completion with review and verification evidence.

## Route Away

- Use `moonshot-phase-runner` for multi-phase plans, long-running harness work, or staged adoption packages.
- Use `product-orchestrator` when the user is still defining product scope.
- Stop for clarification only when a wrong assumption would change scope, security, data shape, or user-visible behavior.

## Hard Stops

- Do not broaden scope beyond the user request.
- Do not skip code review for non-trivial code changes.
- Do not claim completion with stale, missing, or smoke-only evidence.
- Do not mutate unrelated files or revert user changes.

## Flow

1. Confirm the task is bounded and has enough context.
2. Inspect local contracts and affected files before editing.
3. Make the smallest implementation that satisfies the request.
4. Run focused checks and classify failures as implementation, verification, environment, or contract.
5. Apply review feedback, then rerun only the checks invalidated by the change.
6. Close with changed files, verification, residual risk, and no phase-style finalization claims.

## Required Evidence

- Affected file list and rationale.
- Fresh test/build/lint or targeted verification output.
- Review evidence when behavior, shared contracts, or harness logic changes.
- Explicit blocker classification if a required check cannot run.

## References

- `references/bounded-flow.md`: stage order, scope control, and output contract.
- `references/review-and-verification.md`: review gate, verifier expectations, and failure taxonomy.
