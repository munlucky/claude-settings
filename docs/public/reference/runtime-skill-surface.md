# Runtime Skill Surface

`package/runtime-surface.json` is the single authority for Claude/Codex profile-local runtime skill discovery.

Profile-local public runtime skills:

- `product-orchestrator`
- `moonshot-architecture`
- `moonshot-orchestrator`
- `moonshot-phase-runner`
- `moonshot-plan-writer`
- `commit-moonshot`
- `session-logger`

The shared common payload preserves canonical `skills/**` for internal support and source parity. `moonshot-plan-writer` is a user-invoked planning entrypoint and must remain installed into Claude/Codex profile-local public discovery.

## Architecture Handoff Route

Use `product-orchestrator` while the request is still product scope. When product work becomes architecture-heavy, route through `moonshot-architecture` and pass architecture package paths forward instead of inline summaries.

`moonshot-plan-writer` consumes accepted architecture package paths and maps selected `ADR/*.md`, `TRACEABILITY_MATRIX.md`, and `ARCHITECTURE_REVIEW.md` rows into phase metadata, owners, verification signals, and acceptance evidence.

`moonshot-orchestrator` consumes a bounded selected ADR and traceability slice. `moonshot-phase-runner` consumes multi-phase, staged adoption, or long-running architecture-derived plan packages.

Controlled adoption remains source-first: package dry-run and installer dry-run must pass before account-root or profile sync mutates live runtime files.
