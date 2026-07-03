# ADR-0001: Add Generated Experience Read-Model Before Autonomous Search

## Status

Accepted.

## Context

Meta-Harness gains come from selective access to prior source, scores, and execution traces. Moonshot Relay already records durable lab artifacts, but they are not normalized into a search surface for proposal generation or operator diagnosis.

## Decision

Add a generated experience read-model and read-only history CLI before considering autonomous source-mutating search. The read-model is rebuildable from existing run, baseline, compare, and closeout artifacts.

## Consequences

- Agents and operators can query prior failure classes and artifact paths without loading entire run directories into prompt context.
- Generated state remains outside package payloads.
- The index cannot be promotion authority.
- The implementation must not duplicate or replace existing run artifacts as a new authoritative store.
