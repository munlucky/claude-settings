---
name: architecture-option-generator
description: Internal Moonshot Architecture stage for generating architecture options from ASRs, constraints, and current evidence.
layer: internal
outputArtifacts:
  - ARCHITECTURE_OPTIONS.md
  - CAPABILITY_MAP.md
  - TRACEABILITY_MATRIX.md
---

# Architecture Option Generator

## Role

Generate feasible architecture options that respond to ASRs, constraints, and mode-specific evidence.

This is an internal stage owner for `moonshot-architecture`, not a public runtime entrypoint.

## Inputs

- `ASR_CATALOG.md`
- `QUALITY_ATTRIBUTE_SCENARIOS.md`
- `DOMAIN_MODEL.md` and `CAPABILITY_MAP.md`
- Brownfield evidence when mode is `brownfield_codebase` or `hybrid_prd_plus_existing_repo`

## Flow

1. Group ASRs by architectural force and affected capability.
2. Generate at least two meaningful options for non-trivial work.
3. State dependencies, reversibility, migration cost, operational impact, and verification signal for each option.
4. Link every option to requirement IDs and ASR IDs.
5. Identify option gaps that need trade-off review before ADR writing.

## Hard Stops

- Do not generate one-option analysis for non-trivial architecture work.
- Do not propose Brownfield changes without current architecture evidence.
- Do not optimize for novelty over implementable constraints.
- Do not hand off options without verification signals.

## Required Evidence

- Option IDs.
- Requirement and ASR links.
- Benefits, costs, risks, dependencies, and reversibility notes.
- Verification signal for each option.
