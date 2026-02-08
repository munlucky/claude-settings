---
name: moonshot-plan-writer
description: "Create or refresh docs/implementation planning documents for this repository. Use when asked to generate or update implementation plan markdown files. Always inspect root-level *.md files and docs/implementation/*.md first, then maintain two outputs: (1) a master plan (00-master-plan-v*.md) as a plan-of-plans with phase completion checklist, and (2) phase plan files with standalone, session-executable detailed plans. Enforce checklist sync and repeat until every master checklist item is checked."
---

# Implementation Plan Writer

## Goal
Produce reliable planning docs in `docs/implementation` with strict master/phase structure.

## Required Inputs
- `docs/PRD-v2.md` (product requirements baseline)
- `docs/SPEC-v2.md` (technical contract baseline)
- `docs/GDD.md` (gameplay/experience baseline)
- Plan directory path (default: `docs/implementation`)
- Phase list (from existing files or user request)

## Source-of-Truth Precedence
- Use `PRD-v2` to define product scope, priority, and success criteria.
- Use `SPEC-v2` to define data model, interfaces, and implementation constraints.
- Use `GDD` to define scene flow, interaction feel, and gameplay intent.
- Resolve conflicts with this order:
  1. Scope/priority: `PRD-v2`
  2. Technical contract: `SPEC-v2`
  3. Experience direction: `GDD`
- If a conflict cannot be resolved safely, note it explicitly in the plan as an open decision.

## Workflow
1. Load canonical source documents first.
   - Read `docs/PRD-v2.md`, `docs/SPEC-v2.md`, `docs/GDD.md`.
   - Extract requirement units and assign trace IDs (example: `PRD-5.1`, `SPEC-2.4`, `GDD-3.2`).
2. Inspect existing implementation markdown context.
   - Read root-level `*.md` files (non-recursive).
   - Read `docs/implementation/*.md`.
   - Identify current master plan filename (`00-master-plan-v*.md` preferred).
3. Build a source traceability map.
   - Map each source requirement to one target phase document.
   - List unmapped requirements as explicit gaps.
4. Build or update the master plan.
   - Treat master plan as "plan of all plans."
   - Include phase index and dependency/order summary.
   - Include source traceability matrix (`PRD/SPEC/GDD -> Phase`).
   - Include phase completion checklist that maps 1:1 to phase documents.
5. Build or update each phase plan document.
   - Keep each phase document independently executable in a separate session.
   - Include enough context so the phase can be executed without hidden assumptions.
   - Include source mapping section with referenced trace IDs.
6. Synchronize completion state.
   - When a phase is completed, immediately mark its master checklist item as checked.
   - Record evidence links used to justify checked state.
7. Apply completion loop.
   - Continue iterating until every source requirement is mapped and every master checklist item is checked.
   - Continue iterating until every master checklist item is checked.
   - Never treat work as fully complete while any checklist item remains unchecked.

## Master Plan Rules
- Filename: `docs/implementation/00-master-plan-v{n}.md` (or existing master filename if already established).
- Must include:
  - Source baseline section listing `PRD-v2`, `SPEC-v2`, `GDD`.
  - Scope and objective of the whole implementation effort.
  - Phase list with file links.
  - Phase dependency/order notes.
  - Source traceability matrix:
    - Columns: `Req ID`, `Source`, `Requirement Summary`, `Phase`, `Plan File`, `Status`.
  - Unmapped source requirements section (if any).
  - "Phase Completion Checklist" section with markdown checkboxes (`- [ ]`, `- [x]`).
- Checklist rule:
  - One checklist item per phase.
  - Item label format: `Phase NN - <title> (<file>)`.
  - Update to `[x]` only when phase completion criteria in that phase doc are satisfied.

## Phase Plan Rules
- Filename pattern: `docs/implementation/{NN}-{phase-name}-v{n}.md`.
- Each file must be a standalone session plan and include:
  - Source mapping (`Req ID` + section reference from PRD/SPEC/GDD).
  - Goal and expected outcome.
  - Scope / out-of-scope.
  - Preconditions and required inputs.
  - Detailed task breakdown (ordered steps with IDs).
  - Validation/test plan.
  - Deliverables.
  - Phase completion checklist with objective criteria.
- Keep tasks actionable and verifiable (avoid vague "implement X" only).

## Completion Loop (Critical)
Use this loop whenever generating or refreshing plans:

```text
while (master checklist has unchecked items) OR (unmapped source requirements exist):
  1) Pick an unchecked phase or an unmapped source requirement
  2) Ensure the target phase doc has complete standalone execution detail
  3) Ensure source trace IDs are mapped to concrete tasks and done criteria
  4) Verify completion criteria and evidence availability
  5) If criteria satisfied: mark [x] in master checklist
     else: add/fix missing details and keep [ ]
  6) Continue until all checklist items are [x] and source map has no gaps
```

If implementation appears finished but checklist is not fully checked, continue with verification/backfill iterations until the checklist is complete.

## Templates
- Use `assets/master-plan.template.md` as the base for master plan generation.
- Use `assets/phase-plan.template.md` as the base for phase plan generation.

## Guardrails
- Do not invent repository facts; derive from existing docs/files.
- Preserve user-authored constraints already present in plan docs.
- Do not drop a source requirement from PRD/SPEC/GDD without documenting why it is excluded.
- Keep numbering, filenames, and checklist states consistent across all plan files.
