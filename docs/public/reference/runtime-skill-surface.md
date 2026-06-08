# Runtime Skill Surface

`package/runtime-surface.json` is the single authority for Claude/Codex profile-local runtime skill discovery.

Profile-local public runtime skills:

- `product-orchestrator`
- `moonshot-orchestrator`
- `moonshot-phase-runner`
- `moonshot-plan-writer`
- `commit-moonshot`
- `session-logger`

The shared common payload preserves canonical `skills/**` for internal support and source parity. `moonshot-plan-writer` is a user-invoked planning entrypoint and must remain installed into Claude/Codex profile-local public discovery.
