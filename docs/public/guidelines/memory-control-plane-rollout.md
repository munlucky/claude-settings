# Memory Control Plane Rollout

Canonical source guideline for rolling memory control-plane changes from source contracts into package payloads, installed account roots, or optional external graph backends.

## Rollout Order

1. Source gate: targeted tests, `npm test`, independent review, and source diff review pass.
2. Eval gate: memory-control-plane fixtures pass without worsened stale, candidate, provenance, or replan behavior.
3. Package gate: package materialization includes required source scripts/schemas/docs and excludes generated state.
4. Temp install gate: temp-home install proves payload shape and rollback safety.
5. Live account-root gate: explicit operator approval, install parity, doctor/audit, and rollback evidence.
6. External backend gate: accepted ADR, security/privacy review, migration dry-run, and rollback runbook.

## Non-Negotiables

- Do not write live MemoryGraph, account-root knowledge, `.claude`, `.codex`, or `.qwen` state from source-only phases.
- Do not promote failure or procedural memory from a single trace without evidence, review, replay, rollback plan, and scope owner.
- Do not treat package materialization or installed profile parity as completion authority.
- Do not select Graphiti, Neo4j, Basic Memory, MCP servers, or any external backend without a backend ADR and data-state migration policy.

## Evidence Slots

Required rollout records name:

- source command and result;
- package dry-run or materialization output;
- generated-state exclusion proof;
- temp-home or live install target;
- rollback or supersession strategy;
- stale projection behavior;
- unresolved missing-policy gates.
