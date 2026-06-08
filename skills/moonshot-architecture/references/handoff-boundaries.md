# Handoff Boundaries

`moonshot-architecture` does not implement code. It hands off design evidence.

Handoff to `moonshot-plan-writer` when work is multi-phase, migratory, or requires source plan packaging.

Handoff to `moonshot-orchestrator` only when the implementation is bounded, owned paths are clear, and fresh verification commands exist.

Handoff to `moonshot-phase-runner` when work includes:

- multi-phase execution
- migration
- runtime surface changes
- harness-level changes
- controlled adoption
- large Brownfield refactors

Do not mutate live `.claude/**`, `.codex/**`, account-root state, or runtime profiles during architecture design. Controlled adoption belongs to an explicit later phase.
