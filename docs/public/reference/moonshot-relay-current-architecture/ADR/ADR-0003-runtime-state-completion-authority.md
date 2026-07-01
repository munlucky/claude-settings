# ADR-0003 Runtime State Completion Authority

## Status

Accepted

## Context

Moonshot Relay phase execution can produce markdown plans, phase status files, runtime events, eval results, and completion decisions. Markdown presence alone is insufficient for reliable closeout.

## Decision

Keep completion authority in runtime-state evidence and explicit verification signals. Phase status and architecture/plan documents are inputs, not completion decisions.

## Consequences

- Long-running harness work requires runtime-state and verification evidence before completion claims.
- `moonshot-architecture` packages hand off design evidence but do not replace `moonshot-phase-runner` completion authority.
- Future implementation plans must map requirements to owners and verification signals.

## Rejected Alternatives

- Treat a complete-looking plan package as proof of execution.
- Treat `phase-status.yaml` alone as whole-plan completion authority.
