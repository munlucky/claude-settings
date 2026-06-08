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

For architecture-derived work, this means a bounded selected ADR and traceability slice, not an unbounded architecture package.

## Route Away

- Use `moonshot-phase-runner` for multi-phase plans, long-running harness work, or staged adoption packages.
- Use `product-orchestrator` when the user is still defining product scope.
- Use `moonshot-architecture` before implementation when the request lacks an accepted architecture package for non-trivial architecture decisions.
- Stop for clarification only when a wrong assumption would change scope, security, data shape, or user-visible behavior.

## Hard Stops

- Do not broaden scope beyond the user request.
- Do not skip code review for non-trivial code changes.
- Do not claim completion with stale, missing, or smoke-only evidence.
- When runtime-state completion authority is available, do not claim clean finish from chat output, markdown reports, phase status, or verifier JSON alone. Require `scripts/runtime-state.mjs assess-completion` to produce an accepted DB decision.
- Before approval-required operations or writes near protected runtime paths, classify the operation with `tools/sandbox/policy.mjs check --json`; unauthorized blocking events must stop clean completion.
- Do not mutate unrelated files or revert user changes.

## Flow

1. Confirm the task is bounded and has enough context.
2. If an architecture package is supplied, consume selected `ADR/*.md`, `TRACEABILITY_MATRIX.md`, `PLAN.md`, and `ARCHITECTURE_REVIEW.md` paths; do not replace them with chat-only summaries.
3. Inspect local contracts and affected files before editing.
4. Make the smallest implementation that satisfies the selected ADR and traceability slice.
5. Run focused checks and classify failures as implementation, verification, environment, or contract.
6. Apply review feedback, then rerun only the checks invalidated by the change.
7. Close with changed files, verification, residual risk, and no phase-style finalization claims.

## Required Evidence

- Affected file list and rationale.
- Fresh test/build/lint or targeted verification output.
- Review evidence when behavior, shared contracts, or harness logic changes.
- Explicit blocker classification if a required check cannot run.

## References

- `references/bounded-flow.md`: stage order, scope control, and output contract.
- `references/review-and-verification.md`: review gate, verifier expectations, and failure taxonomy.

## Project Knowledge Context Contract

Before assembling bounded implementation prompts, consume `projectKnowledgeContext.promptBlock` from `knowledge-context-build.mjs` with the stage that matches the current work (`execute` for implementation, `verify` for verification). Pass only the compact summary block to workers.

Attempt/workflow metadata may record only `status`, `strictness`, `stage`, `blocking`, `unavailableCount`, and `knowledgeRevision`. Raw MemoryGraph/KG/ontology records, runtime logs, transcripts, and secret-like strings are forbidden in prompts and manifests.
