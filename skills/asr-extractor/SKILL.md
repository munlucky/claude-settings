---
name: asr-extractor
description: Internal Moonshot Architecture stage for extracting architecturally significant requirements and quality attribute scenarios from normalized requirements.
layer: internal
outputArtifacts:
  - ASR_CATALOG.md
  - QUALITY_ATTRIBUTE_SCENARIOS.md
  - TRACEABILITY_MATRIX.md
---

# ASR Extractor

## Role

Extract architecturally significant requirements from `REQUIREMENT_INVENTORY.md`, PRD evidence, and Brownfield constraints.

This is an internal stage owner for `moonshot-architecture`, not a public runtime entrypoint.

## Inputs

- `REQUIREMENT_INVENTORY.md`
- PRD, SPEC, or Brownfield evidence summary
- Known constraints, risks, and quality attributes

## Flow

1. Identify requirements that materially affect structure, runtime behavior, data boundaries, security, performance, reliability, operability, or integration contracts.
2. Assign stable `ASR-001` style IDs and link each ASR to one or more `REQ-001` style IDs.
3. Write quality attribute scenarios with stimulus, environment, response, and response measure.
4. Record rejected ASR candidates when a requirement is product-important but not architecture-significant.
5. Preserve traceability links for downstream option generation and ADR/C4 writing.

## Hard Stops

- Do not label every requirement as an ASR.
- Do not create ASRs without requirement IDs.
- Do not invent quality measures when the source is silent; mark the gap explicitly.
- Do not expose raw MemoryGraph, KG, ontology, log, transcript, browser, or secret-like data.

## Required Evidence

- Source requirement IDs.
- ASR IDs and rationale.
- Quality attribute scenarios.
- Verification signal or explicit verification gap for each ASR.
