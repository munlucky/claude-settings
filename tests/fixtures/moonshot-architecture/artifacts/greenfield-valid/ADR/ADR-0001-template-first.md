# ADR-0001: Template-first architecture package

## Status

Accepted

## Context

REQ-001 and ASR-001 require repeatable architecture artifacts.

## Decision

Use templates and schema-backed validator before flow generation.

## Consequences

- Phase output has stable file names.
- Generators must follow this contract.

## Rejected Alternatives

| Alternative | Reason Rejected |
|---|---|
| Free-form notes | No stable validation signal. |
