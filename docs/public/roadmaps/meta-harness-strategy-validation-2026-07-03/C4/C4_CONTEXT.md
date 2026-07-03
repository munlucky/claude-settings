# C4 Context

## System

Moonshot Relay harness-lab evaluates and promotes harness changes through an external H0 authority.

## External References

- Meta-Harness paper and official examples are research inputs only.
- No upstream runtime becomes part of Moonshot Relay by this package.

## Users

- Operator: inspects run history, failure classes, and proposed improvements.
- Planning agent: uses architecture package and history summaries to prepare a phase plan.
- Future proposer agent: may consult generated experience evidence after a later controlled adoption phase.

## Boundary

Generated evidence under `.moonshot-relay/harness-lab/**` is runtime state. Canonical source under `docs/public/**`, `tools/**`, `tests/**`, and `scripts/**` defines schemas, commands, and tests.
