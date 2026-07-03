# Daily Retro Harness Loop

Date: 2026-07-03

This package adapts the supplied retro plan to the current Moonshot Relay source tree. It is an architecture and implementation planning package, not an implementation patch.

## Package Contents

- `ARCHITECTURE_BRIEF.md`: mode classification, current fit, and final design boundary.
- `REQUIREMENT_INVENTORY.md`: accepted, deferred, and rejected requirements.
- `ASR_CATALOG.md`: architecture-significant requirements and quality scenarios.
- `CURRENT_ARCHITECTURE.md`: repository evidence relevant to retro work.
- `ARCHITECTURE_OPTIONS.md`: option comparison for adding the loop.
- `TRADEOFF_ANALYSIS.md`: decision trade-offs and risk handling.
- `SPEC_DELTA.md`: source-surface delta for implementation.
- `PLAN.md`: architecture handoff plan.
- `TRACEABILITY_MATRIX.md`: requirement to owner and verification mapping.
- `00-master-plan-v1.ko.md`: phase-runner oriented implementation master plan.
- `01-retro-contract-and-docs-v1.ko.md` through `05-cli-skill-docs-adoption-v1.ko.md`: phase docs.
- `ARCHITECTURE_REVIEW.md`: review gate and independent review closure.
- `ARCHITECTURE_HANDOFF.json`: handoff slice for `moonshot-phase-runner`.
- `ADR/`: design decisions.
- `C4/`: context and component boundaries.
- `planning-loop/`: independent review evidence.

## Decision

Add a retrospective learning loop as an advisory control-plane path:

```text
task closeout evidence
  -> project retro outbox collect.json
  -> moonshot-relay retro collect
  -> moonshot-relay retro import
  -> retro inbox
  -> daily retro pattern report
  -> improvement candidates
  -> proposal / issue draft
```

The retro loop must not change verify, score, closeout, promotion, installed profile, or account-root completion authority. Every generated retro artifact carries `promotionAuthority: false`.

## Scope

Accepted for implementation planning:

- schemas and templates for collect, daily, candidate, proposal, and issue draft artifacts
- `tools/retro/**` read/write helpers and CLI commands
- `bin/moonshot-relay.mjs retro ...` dispatch
- contract tests and fixture data
- public guidelines and a `moonshot-retro` skill surface

Deferred:

- direct GitHub Issue creation
- automatic source mutation from retro findings
- account-root install/profile adoption
- merging retro results into `harness-history`

Rejected:

- treating daily retro output as completion evidence
- committing runtime retro inbox/daily/proposal output as source
- copying raw logs, prompt archives, transcripts, MemoryGraph dumps, KG dumps, ontology dumps, or secret-like strings into collect records
