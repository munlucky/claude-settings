# ADR-0101: Preserve source-first runtime control plane boundaries

## Status

Accepted

## Context

REQ-101 through REQ-107 describe an existing harness with multiple authority planes: canonical source, package materialization, runtime profile exposure, runtime-state completion authority, verification-plane evidence, workflow routing, and knowledge promotion. Current evidence in `AGENTS.md`, `docs/public/repository-layout.md`, `docs/public/runtime-control-plane.md`, `package/package-contract.yaml`, `package/runtime-surface.json`, and active tests supports this split.

The main architecture risk is not missing components. The risk is authority drift: profile-local output could be edited as if canonical, status projections could be treated as completion authority, or internal skills could leak into public discovery.

## Decision

Use OPT-101: preserve the source-first architecture and document the current brownfield structure as a handoff package.

Accepted boundaries:

- Root source directories are canonical.
- Root `.claude/` and `.codex/` are local runtime profiles and generated/local compatibility output.
- `package/runtime-surface.json` is the single profile-local public skill discovery authority.
- Runtime-state DB and `assess-completion` are the whole-plan completion authority.
- Verification-plane evidence is required before accepted completion.
- Knowledge and memory are advisory until verified and promoted through explicit gates.

## Consequences

- Future architecture or implementation plans can reference this package instead of re-discovering core boundaries.
- Package, runtime-surface, installer, and docs changes must move together when public surface changes.
- Closeout claims must continue to distinguish source state, account-root install state, and runtime-state completion state.
- The architecture remains more complex than a single-profile install, but it preserves cross-runtime parity and state safety.

## Rejected Alternatives

| Alternative | Reason Rejected |
|---|---|
| OPT-102: collapse common payload into profile-local install | Increases drift and risks profile state while weakening Claude/Codex parity. |
| OPT-103: treat projection files as completion authority | Conflicts with runtime-state contract and revives false completion risk. |
| OPT-104: expose all skills profile-local | Bloats prompt surface and bypasses orchestrator/internal stage boundaries. |
