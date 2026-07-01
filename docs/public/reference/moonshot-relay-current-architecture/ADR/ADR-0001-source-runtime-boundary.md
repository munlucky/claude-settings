# ADR-0001 Source and Runtime Boundary

## Status

Accepted

## Context

Moonshot Relay has canonical source directories, generated package payloads, local runtime profiles, and account-root runtime state. Architecture design work must not make live profile or account-root changes as a side effect.

## Decision

Keep durable architecture packages in tracked source documentation and preserve `.claude/**`, `.codex/**`, `.moonshot-relay/**`, sqlite state, logs, traces, browser artifacts, caches, and verdict JSON as runtime/generated surfaces outside this design change.

## Consequences

- Source review can inspect the architecture package without runtime mutation.
- Runtime/profile adoption remains a later explicit implementation phase.
- The package must not claim installed parity.

## Rejected Alternatives

- Mutate profile-local `.claude/**` or `.codex/**` directly during architecture design.
- Store the only architecture baseline under generated `.moonshot-relay/**` task output.
