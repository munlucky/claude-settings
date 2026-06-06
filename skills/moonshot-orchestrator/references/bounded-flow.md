# Bounded Flow

Use this reference when `moonshot-orchestrator` owns a small implementation slice.

## Stage Order

1. Confirm the request is bounded and has enough local context.
2. Inspect affected source and existing tests before editing.
3. Add or select the smallest deterministic regression check for harness changes.
4. Implement only the requested behavior.
5. Run focused verification and classify failures.
6. Apply review feedback only when it is blocking or clearly in scope.

## Output Contract

Close with changed files, verification commands, and residual risk. Do not claim whole-plan or phase-runner completion from a bounded task.
