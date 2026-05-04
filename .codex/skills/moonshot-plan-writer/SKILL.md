---
name: moonshot-plan-writer
description: Create or refresh `docs/implementation` master and phase plans for phase-based work.
---

# Implementation Plan Writer

## Goal
Produce reliable planning docs in `docs/implementation` with strict master/phase structure.

This skill is the default plan bootstrap for `moonshot-phase-runner` when no safe `<plan-dir>` can be reused.
It is the main Plan-stage owner for phase documents.

## Required Inputs
- One or more available requirement sources (not fixed filenames):
  - Preferred when present: `docs/PRD-v2.md`, `docs/SPEC-v2.md`, `docs/GDD.md`
  - Fallbacks: `docs/PRD*.md`, `docs/SPEC*.md`, `docs/GDD*.md`, root-level requirement/design docs, issue/ticket text, user request
- Plan directory path (default: `docs/implementation`)
- Phase list (from existing files or user request)

## Source-of-Truth Precedence
- Resolve sources by semantic role (not filename):
  1. Scope/priority source (PRD-like)
  2. Technical contract source (SPEC-like)
  3. Experience direction source (GDD-like)
- If multiple files match the same role, prefer the most explicit/latest project baseline and record what was selected.
- If a role is missing, continue with available sources and note the missing baseline as an explicit gap/open decision.
- If a conflict cannot be resolved safely, note it explicitly in the plan as an open decision.

## Workflow
0. Run `project-memory-agent` with `stage=plan`, `memoryMode=read_only`, and merge only summarized `projectMemoryContext`.
   - Use prior decisions, domain terms, non-goals, and architecture boundaries as planning deltas.
   - Do not use `.claude/docs/ko/` as a MemoryGraph source.
   - Omit MemoryGraph entries that duplicate system/developer/AGENTS/rules policy.
1. Discover and load available source documents first.
   - Check preferred files first: `docs/PRD-v2.md`, `docs/SPEC-v2.md`, `docs/GDD.md`.
   - If any are missing, scan `docs/` and root-level `*.md` for PRD/SPEC/GDD-like requirement sources.
   - If no requirement docs exist, use user request and ticket/issue text as baseline and mark a source-gap note in the master plan.
   - Extract requirement units and assign trace IDs (example: `PRD-5.1`, `SPEC-2.4`, `GDD-3.2`, `REQ-1.1`).
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
   - Include a "Parallel Execution Plan" section that groups phases into safe waves or records why a phase must stay sequential.
   - Include source traceability matrix (`discovered source requirements -> Phase`).
   - Include phase completion checklist that maps 1:1 to phase documents.
   - Run `plan-ceo-review` on the master plan when scope or cost appears broad.
5. Build or update each phase plan document.
   - Keep each phase document independently executable in a separate session.
   - Include a `Phase Execution Metadata` YAML block with machine-readable ownership and parallel eligibility.
   - Slice phases by merge-safe `ownedPaths` whenever phase-level parallel execution is expected; do not rely only on product feature names.
   - Include enough context so the phase can be executed without hidden assumptions.
   - Include source mapping section with referenced trace IDs.
   - Map every user-facing requirement to at least one `SCN-*` row in `Critical Product Scenarios`.
   - Include exact files to create/modify/test, exact commands, expected fail/pass signals, blocker conditions, review checkpoints, and verification evidence paths.
   - Run `plan-eng-review` when dependencies, ownership, or verification paths are non-trivial.
6. Synchronize completion state.
   - When a phase is completed, immediately mark its master checklist item as checked.
   - Record evidence links used to justify checked state.
7. Apply completion loop.
   - Continue iterating until every source requirement is mapped and every master checklist item is checked.
   - Never treat work as fully complete while any checklist item remains unchecked.

## Master Plan Rules
- Filename: `docs/implementation/00-master-plan-v{n}.md` (or existing master filename if already established).
- Must include:
  - Source baseline section listing selected requirement sources (with role labels when possible).
  - Scope and objective of the whole implementation effort.
  - Phase list with file links.
  - Phase dependency/order notes.
  - "Parallel Execution Plan" section with wave groups, sequential phases, and blocker reasons.
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
  - Phase execution metadata using this minimum YAML shape:
    ```yaml
    phaseExecution:
      schemaVersion: 1
      parallelEligible: true
      parallelGroup: "<wave-slug>"
      dependsOn: []
      conflictsWith: []
      ownedPaths: []
      readOnlyPaths: []
      sharedMutablePaths: []
      requiresManualEvidence: false
      mergePolicy: "disjoint_patch"
    ```
  - Source mapping (`Req ID` + section reference from selected requirement sources).
  - Goal and expected outcome.
  - Scope / out-of-scope.
  - Preconditions and required inputs.
  - Detailed task breakdown (ordered steps with IDs).
  - Critical product scenarios (`SCN-*`) for user-visible behavior, rendered output, generated assets, and workflow results.
  - Validation/test plan.
  - Deliverables.
  - Phase completion checklist with objective criteria.
- Keep tasks actionable and verifiable (avoid vague "implement X" only).
- Treat `ownedPaths` as the only paths a parallel worker may create or modify.
- Leave `parallelEligible: false` and record `parallelBlockers` when ownership is ambiguous, shared mutable files are required, manual evidence is required, or dependencies are not complete.
- Keep package manifests, lockfiles, verification contracts, phase status files, and other shared mutable files out of parallel phases unless the phase is explicitly sequential.
- Each task must name:
  - exact files or modules to create, modify, and test
  - exact commands to run
  - expected failing and passing signals
  - blocker condition that stops execution
  - review checkpoint
  - verification evidence path
- Each critical scenario must name:
  - the user-visible expectation
  - the command that proves it
  - the expected pass signal
  - the evidence path that will be cited in `QA_REPORT.md`

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
- Do not drop a source requirement from the selected baseline sources without documenting why it is excluded.
- Keep numbering, filenames, and checklist states consistent across all plan files.
- Do not declare a phase ready when verification commands or ownership boundaries are still implicit.
- Do not declare a phase ready when files, commands, expected signals, blocker conditions, or evidence paths are still implicit.
- Do not declare a phase parallel-ready when `ownedPaths`, dependency edges, conflict edges, and manual-evidence requirements are implicit.

## Phase Runner Integration

When called as a fallback by `moonshot-phase-runner`:
- default output directory is `docs/implementation`
- return the resolved master plan path and plan directory
- prefer refreshing an incomplete plan package over creating a parallel duplicate
