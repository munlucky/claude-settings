# Bounded Flow

Use this reference when `moonshot-orchestrator` owns a small implementation slice.

## Stage Order

1. Confirm the request is bounded and has enough local context.
2. Inspect affected source and existing tests before editing.
3. Read `docs/public/guidelines/minimal-correct-implementation.md` and choose the lowest viable ladder rung before adding a new abstraction, public surface, dependency, runtime behavior, or test helper.
4. Add or select the smallest deterministic regression check for harness changes.
5. Implement only the requested behavior with the smallest source change that preserves authority and evidence gates.
6. Run focused verification and classify failures.
7. Apply review feedback only when it is blocking or clearly in scope.

## Output Contract

Close with changed files, minimality decision, verification commands, and residual risk. Do not claim whole-plan or phase-runner completion from a bounded task.
