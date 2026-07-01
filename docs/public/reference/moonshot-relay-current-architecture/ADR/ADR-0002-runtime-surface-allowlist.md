# ADR-0002 Runtime Surface Allowlist

## Status

Accepted

## Context

Moonshot Relay preserves many canonical skills in the shared payload, but Claude/Codex profile-local discovery is intentionally limited to a small public entrypoint set.

## Decision

Keep public runtime skill discovery allowlisted by `package/runtime-surface.json` and `package/package-contract.yaml`. Internal skills remain source-owned and shared-payload preserved, but they are not profile-local public entrypoints unless a controlled adoption phase changes the surface.

## Consequences

- Profile-local discovery remains predictable.
- Internal architecture stage owners can exist without becoming user-facing runtime entrypoints.
- Future skill-surface changes require package/materialization verification.

## Rejected Alternatives

- Expose every canonical skill profile-locally.
- Treat package materialization output as canonical source.
