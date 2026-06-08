---
name: adr-c4-writer
description: Internal Moonshot Architecture stage for writing C4 model artifacts and ADRs from accepted architecture decisions.
layer: internal
outputArtifacts:
  - C4/C4_CONTEXT.md
  - C4/C4_CONTAINER.md
  - C4/C4_COMPONENT.md
  - ADR/*.md
  - TRACEABILITY_MATRIX.md
---

# ADR C4 Writer

## Role

Write C4 model artifacts and Architecture Decision Records from accepted architecture decisions.

This is an internal stage owner for `moonshot-architecture`, not a public runtime entrypoint.

## Inputs

- `TRADEOFF_ANALYSIS.md`
- Selected architecture option
- Requirement IDs, ASR IDs, and verification signals
- Brownfield current architecture evidence when available

## Flow

1. Write C4 context, container, and component artifacts at the output paths declared by the architecture templates.
2. Write one ADR per significant accepted decision under `ADR/ADR-0001-title.md`.
3. Record context, decision, consequences, rejected alternatives, and traceability in each ADR.
4. Link C4 elements and ADRs back to requirements, ASRs, and verification signals.
5. Keep diagrams inspectable as markdown or mermaid source.

## Hard Stops

- Do not write ADRs without rejected alternatives.
- Do not claim C4 coverage without a clear system boundary.
- Do not mix source template paths with generated output paths.
- Do not omit traceability from ADRs.

## Required Evidence

- C4 artifact paths.
- ADR IDs and decision status.
- Requirement and ASR links.
- Consequences, rejected alternatives, and verification signals.
