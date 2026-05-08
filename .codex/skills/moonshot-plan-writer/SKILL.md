---
name: moonshot-plan-writer
description: Create, refresh, and organize `docs/implementation` master and phase plans for phase-based work.
---

# Implementation Plan Writer

## Goal
Produce reliable planning docs in `docs/implementation` with strict master/phase structure.
Keep existing implementation/work documents organized so active plan packages, stale plan packages, runtime evidence, and overlapping drafts are easy to distinguish.

This skill is the default plan bootstrap for `moonshot-phase-runner` when no safe `<plan-dir>` can be reused.
It is the main Plan-stage owner for phase documents.

## Required Inputs
- One or more available requirement sources (not fixed filenames):
  - Preferred when present: `docs/PRD-v2.md`, `docs/SPEC-v2.md`, `docs/GDD.md`
  - Fallbacks: `docs/PRD*.md`, `docs/SPEC*.md`, `docs/GDD*.md`, root-level requirement/design docs, issue/ticket text, user request
- Plan directory path (default: `docs/implementation`)
- Existing work document roots to inspect when present (default: the plan directory plus configured `documentPaths.tasksRoot`)
- Phase list (from existing files or user request)
- Active phase status file path when preparing a runnable package (default: `.claude/docs/phase-status.yaml`)
- Execution root when preparing a runnable package (default: `docs/implementation/execution/<plan-slug>`)

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
    - For user-facing MVP work, also scan for `UI_SPEC*`, `UI_FLOW_MAP.md`, `UI_STATE_MATRIX.md`, `MOCK_SCENARIOS.md`, `MOCK_API_CONTRACT.md`, and `USER_DEMO_APPROVAL.md`.
    - If no requirement docs exist, use user request and ticket/issue text as baseline and mark a source-gap note in the master plan.
    - Extract requirement units and assign trace IDs (example: `PRD-5.1`, `SPEC-2.4`, `GDD-3.2`, `REQ-1.1`).
2. Inventory and organize existing implementation/work-document context before writing.
   - Read root-level `*.md` files (non-recursive).
   - Read `docs/implementation/*.md`.
   - If configured `documentPaths.tasksRoot` exists, inspect task directories non-recursively for related work documents that may duplicate or supersede the requested plan.
   - Identify current master plan filename (`00-master-plan-v*.md` preferred).
   - Classify discovered plan/work documents as `active-current`, `active-ambiguous`, `superseded`, `overlapping-draft`, `runtime-evidence`, or `unrelated`.
   - Prefer refreshing the best active/current package over creating a duplicate package.
   - Preserve user decisions, constraints, evidence links, and completed checklist state when consolidating overlapping drafts into the selected master/phase plan set.
   - Record ambiguous active packages as open decisions instead of silently moving, deleting, or overwriting them.
   - When a stale plan package is clearly superseded, move it only through an explicit archive/preservation step, or leave it in place with a superseded note if no safe archive convention exists.
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
    - When `mvpMethodology.profile: demo_first`, slice by maturity milestone instead of backend-first feature layers.
    - In demo-first plans, a Real Functional phase is executable only when `USER_DEMO_APPROVAL.md` is `approved` with a non-empty approved scope.
    - Run `plan-eng-review` when dependencies, ownership, or verification paths are non-trivial.
6. Prepare runnable phase state when the plan package is, or is likely to be, the next execution target.
   - Treat a newly created or refreshed `docs/implementation/00-master-plan-v{n}.md` package as runnable by default when:
     - the user explicitly names `moonshot-plan-writer`;
     - the selected plan lives under `docs/implementation`;
     - recent conversation includes `moonshot-phase-runner`, phase execution, "개발진행", "계속 진행", or similar continue-execution intent.
   - Skip runnable preparation only when the user explicitly asks for docs-only output or no execution preparation.
   - After creating or refreshing a new active package, always run `prepare-implementation-plan-state.mjs --dry-run` before the final response.
   - Preserve active root plan documents for the selected package only.
   - Archive stale runtime/evidence surfaces instead of deleting them:
     - `docs/implementation/execution`
     - `docs/implementation/close`
     - the previous `.claude/docs/phase-status.yaml` active pointer
     - `.claude/logs/workflow-enforcement/current-run.json`
     - `.claude/logs/workflow-enforcement/active-phase-run.json`
     - `.claude/logs/workflow-enforcement/latest-dispatch.json`
     - `.claude/logs/workflow-enforcement/dispatch-*.json` entries that reference a superseded master plan or execution root
   - Treat stale master/executionRoot pointer leaks as preparation failures. Example: a v8 top-level `current-run.json` with a v9 embedded `phaseRunLease` means the workstream was not initialized cleanly; stop before phase-runner dispatch and repair preparation instead of reconciling mid-run.
   - Use:
     ```bash
     node .claude/scripts/prepare-implementation-plan-state.mjs \
       --plan-dir docs/implementation \
       --master-plan docs/implementation/00-master-plan-v{n}.md \
       --status-file .claude/docs/phase-status.yaml \
       --execution-root docs/implementation/execution/<plan-slug> \
       --archive-label <archive-label>
     ```
   - Run the same command with `--dry-run` first, using the same archive label planned for the real run. If dry-run reports stale pointers, stale active root docs, or runtime/evidence surfaces from a superseded workstream, run the prepare script for real before reporting completion.
   - Do not manually patch `phase-status.yaml`, move active phase docs, or move `execution`/`close` directories before the prepare script has produced its dry-run findings.
   - Do not touch `.claude/scripts`, `.claude/runtime-state.sqlite`, `.claude/memory.json`, `.claude/verification.contract.yaml`, project settings, or verification baselines during this preparation step.
   - After preparation, run a pointer self-check before dispatch:
     - Only the selected master and phase docs remain as root-level `docs/implementation/*.md` active plan docs; older master/phase docs are archived under one archive label.
     - The rewritten `phase-status.yaml` must point to the selected master plan and execution root, mark phase 1 pending/prepared, and list only the current plan's phase docs.
     - `current-run.json`, `active-phase-run.json`, and `latest-dispatch.json` must be absent/archived or reference the selected master plan and execution root at both top level and embedded `phaseRunLease`.
     - `goalRuntime.status` must not be `complete` while any actionable phase remains pending, in_progress, blocked, or retryable.
     - Remaining/actionable phase counts must match the master checklist and phase-status phase list.
   - Record the archive location for stale runtime/evidence surfaces in the master plan or phase status notes when the repository has a note field.
7. Synchronize completion state.
   - When a phase is completed, immediately mark its master checklist item as checked.
   - Record evidence links used to justify checked state.
8. Apply completion loop.
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

## Mandatory Active Package Closeout

When creating or refreshing a new `docs/implementation/00-master-plan-v{n}.md` package, the completion target is not just written Markdown. The package must be organized as a single active, phase-runner-ready workstream unless the user explicitly requests docs-only output.

Before the final response:
- Run `prepare-implementation-plan-state.mjs --dry-run` for the selected master plan, status file, execution root, and archive label.
- If dry-run reports stale pointers or superseded active surfaces, run the prepare script for real.
- Verify root-level `docs/implementation/*.md` contains only the selected active master/phase docs.
- Verify older master/phase docs are archived under one archive label.
- Verify `.claude/docs/phase-status.yaml` points to the selected `masterPlan` and `executionRoot`.
- Verify `docs/implementation/execution/<plan-slug>` exists and is initialized for the selected plan.
- Verify workflow-enforcement `current-run`, `active-phase-run`, `latest-dispatch`, and stale `dispatch-*.json` records do not reference superseded master plans or execution roots.

If an archive label collision creates a `-1` archive directory, consolidate related archived plan docs, execution evidence, closeout evidence, phase-status snapshots, and workflow-enforcement files into one final archive directory before reporting completion.

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

## Existing Document Organization Rules
- Always inventory existing plan/work documents before creating new master or phase files.
- Treat a plan package as active when it has a current master plan, referenced phase docs, active phase status pointer, or recent execution/close evidence that matches the requested workstream.
- Treat a package as superseded only when a newer master plan or explicit closeout evidence covers the same scope.
- Do not delete existing plan, task, evidence, or user-decision documents while organizing. Archive or annotate instead.
- When two documents cover the same scope, select one canonical target, merge durable decisions and evidence references into it, and leave the non-canonical document discoverable through an archive note or superseded note.
- Keep filenames, phase numbers, checklist items, source trace IDs, and phase-status pointers consistent after organization.
- If organization would require moving documents outside the plan directory or configured task root, stop and ask for confirmation.

## Demo-first MVP Profile

Use `mvpMethodology.profile: demo_first` when the MVP must be user-tested through a clickable/mock UI demo before Real Functional implementation.

Required maturity order per in-scope slice:
- `demo_ready_ui`
- `mock_functional_demo`
- `demo_evidence_capture`
- `user_demo_approval`
- `real_functional`
- `real_functional_verification`
- `production_hardening`

Phase names should make the maturity explicit, for example:
- `Create First Project - Demo Ready UI`
- `Create First Project - Mock Functional Demo`
- `Create First Project - Demo Evidence Capture`
- `Create First Project - User Demo Approval`
- `Create First Project - Real Functional`
- `Create First Project - Real Functional Verification`

Every demo-first phase must include a machine-readable `mvpMethodology` block:

```yaml
mvpMethodology:
  profile: demo_first
  sliceId: "<stable-slice-id>"
  maturityTarget: "<one maturity value>"
  demoGate:
    required: true
    mode: hard_stop
    approvalSource: "docs/implementation/USER_DEMO_APPROVAL.md"
    evidenceSource: "docs/implementation/DEMO_EVIDENCE.md"
    mockContractSource: "docs/implementation/MOCK_API_CONTRACT.md"
    blocks:
      - real_functional
      - production_backend
      - real_persistence
      - auth_integration
      - irreversible_migration
```

Completion constraints:
- `Mock Functional Demo` needs mock success and error path evidence.
- `Demo Evidence Capture` needs a demo run command and tested route/flow evidence.
- `User Demo Approval` needs approved scope in `USER_DEMO_APPROVAL.md`.
- `Real Functional` must not close with mock-only evidence and must prove parity with `MOCK_API_CONTRACT.md`.
- Approved UI route, CTA, flow-order, state, or mock response shape changes invalidate the approval and route the work back through `UI_CHANGE_REQUEST.md`, refreshed demo evidence, and user reapproval.

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
- Apply `.claude/docs/guidelines/demo-first-mvp-gate.md` when `mvpMethodology.profile: demo_first`.

## Guardrails
- Do not invent repository facts; derive from existing docs/files.
- Preserve user-authored constraints already present in plan docs.
- Do not drop a source requirement from the selected baseline sources without documenting why it is excluded.
- Keep numbering, filenames, and checklist states consistent across all plan files.
- Do not declare a phase ready when verification commands or ownership boundaries are still implicit.
- Do not declare a phase ready when files, commands, expected signals, blocker conditions, or evidence paths are still implicit.
- Do not declare a phase parallel-ready when `ownedPaths`, dependency edges, conflict edges, and manual-evidence requirements are implicit.
- Do not start `moonshot-phase-runner` when workflow-enforcement active pointers reference a superseded plan package; archive/rewrite them during plan preparation first.

## Phase Runner Integration

When called as a fallback by `moonshot-phase-runner`:
- default output directory is `docs/implementation`
- return the resolved master plan path and plan directory
- prefer refreshing an incomplete plan package over creating a parallel duplicate
