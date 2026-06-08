---
name: codebase-architecture-recovery
description: Internal Moonshot Architecture stage for recovering current architecture from repository evidence before Brownfield design.
layer: internal
outputArtifacts:
  - CURRENT_ARCHITECTURE.md
  - PRD_FIT_GAP.md
  - IMPACT_MAP.md
  - SPEC_DELTA.md
---

# Codebase Architecture Recovery

## Role

Recover the current architecture from repository evidence so Brownfield and Hybrid architecture work does not invent the baseline.

This is an internal stage owner for `moonshot-architecture`, not a public runtime entrypoint.

## Inputs

- Repository files and docs
- Existing tests and runtime contracts
- Current PRD/SPEC or change objective
- Owned/read-only/staged path assumptions

## Flow

1. Identify current entrypoints, boundaries, data flows, integration points, and operational constraints from source evidence.
2. Separate observed architecture from inferred or unknown architecture.
3. Build `CURRENT_ARCHITECTURE.md` with evidence paths and confidence.
4. Build PRD fit-gap, impact map, and spec delta for proposed change.
5. Declare owned, read-only, and staged paths for implementation handoff.

## Hard Stops

- Do not invent current architecture without file evidence.
- Do not cite evidence paths that cannot be resolved in the reviewed repository.
- Do not blur owned and read-only paths.
- Do not propose breaking changes without compatibility, migration, or rollback notes.
- Do not hand off without `SPEC_DELTA.md`, `PLAN.md`, and `TRACEABILITY_MATRIX.md` linking evidence paths to task owners and verification signals.
- Do not include raw secret-like content from source files.

## Required Evidence

- Evidence paths and observations.
- Current boundaries and runtime flow.
- Fit-gap and impact map.
- Owned/read-only/staged paths.
- Compatibility, migration, and rollback notes.
- PLAN task owner and verification signal mapping.
