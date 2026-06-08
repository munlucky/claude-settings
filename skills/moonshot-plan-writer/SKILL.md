---
name: moonshot-plan-writer
description: Create, refresh, and organize docs/implementation master and phase plans for phase-based work.
triggers:
  - "write plan"
  - "master plan"
  - "phase plan"
  - "implementation plan"
deepReferences:
  - references/plan-package-contract.md
  - references/independent-review-loop.md
---

# Moonshot Plan Writer

## Role

Create or revise a phase-plan package that a phase runner can execute without guessing. The output is a master plan plus numbered phase docs, execution metadata, acceptance criteria, blockers, and a clear adoption boundary.

## Hard Stops

- Do not mark a plan execution-ready when phase docs, dependencies, owned paths, or acceptance evidence are missing.
- Do not accept an architecture package handoff without `TRACEABILITY_MATRIX.md`, selected `ADR/*.md`, `ARCHITECTURE_REVIEW.md`, and task owner/verification signal mapping.
- Do not allow child planning agents to mutate the source plan directly. Parent session owns final plan edits.
- Do not put live `.claude/**` adoption into early redesign phases unless the plan explicitly reserves a controlled adoption phase.
- Do not hide unresolved ambiguity. Record it as an assumption, blocker, or user question.

## Flow

1. Identify the user objective and existing plan directory.
2. Audit current artifacts and stale phase docs.
3. Draft or refresh `00-master-plan-*.md` and root `NN-*.md` phase files.
4. Add phase execution metadata: dependencies, conflicts, owned paths, staged paths, adoption targets, read-only paths, and live mutation policy.
5. When an architecture package is present, map selected ADRs and `TRACEABILITY_MATRIX.md` rows into phase scope, owners, verification signals, and acceptance evidence.
6. Run independent review loops as sidecar review, then parent applies accepted edits.
7. Prepare execution only after readiness, traceability, and phase boundary checks are satisfied.

## Required Evidence

- Plan directory and master plan path.
- Phase inventory with dependencies and owned paths.
- Acceptance criteria mapped to phase evidence.
- Architecture package path inventory when used, including traceability matrix, selected ADRs, architecture review, and any Brownfield evidence boundary.
- Review loop findings and accepted changes.
- Explicit adoption strategy for all harness, skill, and agent surfaces.

## References

- `references/plan-package-contract.md`: required files, phase metadata, and readiness checks.
- `references/independent-review-loop.md`: reviewer loop rules and parent-owned edit boundary.

## Project Knowledge Context Contract

Planning intake may consume `projectKnowledgeContext` with `stage=plan`, but it must preserve omissions and status as typed metadata. Independent review prompts receive only the compact `## Project Knowledge Context` block.

Plan packages may record knowledge status and omission categories. They must not copy raw MemoryGraph/KG/ontology records, runtime logs, transcripts, or secret-like strings into master plans, phase docs, or review briefs.
