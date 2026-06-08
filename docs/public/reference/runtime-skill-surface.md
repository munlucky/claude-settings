# Runtime Skill Surface

`package/runtime-surface.json` is the single authority for Claude/Codex profile-local runtime skill discovery.

Profile-local public runtime skills:

- `product-orchestrator`
- `moonshot-orchestrator`
- `moonshot-phase-runner`
- `commit-moonshot`
- `session-logger`

The shared common payload preserves canonical `skills/**`, including `moonshot-plan-writer`, for internal support and source parity. `moonshot-plan-writer` is not installed into Claude/Codex profile-local public discovery.
