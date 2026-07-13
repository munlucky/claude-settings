# Architecture Flow Reference

Load this reference only when internal stage ownership or artifact routing is needed.

| Stage | Internal skill | Primary artifacts |
|---|---|---|
| ASR extraction | `asr-extractor` | `ASR_CATALOG.md`, `QUALITY_ATTRIBUTE_SCENARIOS.md` |
| Option generation | `architecture-option-generator` | `ARCHITECTURE_OPTIONS.md`, `CAPABILITY_MAP.md` |
| Trade-off review | `architecture-tradeoff-reviewer` | `TRADEOFF_ANALYSIS.md`, ADR inputs |
| C4 and ADR | `adr-c4-writer` | `C4/*.md`, `ADR/*.md` |
| Gate review | `architecture-gate-reviewer` | `ARCHITECTURE_REVIEW.md` |
| Brownfield recovery | `codebase-architecture-recovery` | `CURRENT_ARCHITECTURE.md`, `PRD_FIT_GAP.md`, `IMPACT_MAP.md`, `SPEC_DELTA.md` |

These helpers remain internal source skills. The public entrypoint owns mode selection, evidence boundaries, traceability, review, and handoff.
