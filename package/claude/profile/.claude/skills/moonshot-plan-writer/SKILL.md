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

## Runnable Readiness Gate

Treat PRD/SPEC/GDD documents as requirement sources, not as executable contracts by default.
Before preparing runnable phase state, normalize selected sources into a Goal Contract and score readiness with explicit evidence.

Required Goal Contract readiness fields:
- `goalClarity`
- `scopeClarity`
- `acceptanceCriteriaClarity`
- `verificationClarity`
- `clarityScore`
- `ambiguityScore`
- `readinessDecision`

Thresholds:
- `ambiguityScore <= 0.20`: executable
- `0.20 < ambiguityScore <= 0.35`: constrained execution with assumptions
- `ambiguityScore > 0.35`: blocked until clarification or a user-approved replan

Gap detection must cover:
- unverifiable adjectives such as "fast", "intuitive", "robust", or "simple" without measurable evidence
- missing non-goals or excluded scope
- missing verification commands
- missing or ambiguous acceptance criteria
- missing brownfield readiness context when existing code/docs are part of the work

Routing:
- Non-critical ambiguity goes to the assumptions ledger path for the active package.
- Core goal/scope/verification ambiguity goes to blockers and prevents runnable closeout.
- Product-value and brownfield readiness concerns are non-public stage-owner responsibilities; record review evidence instead of adding user-facing commands.

Acceptance criteria extraction:
- Generate stable `AC-*` ids from source requirements and phase completion criteria.
- Each `AC-*` must keep a source label and evidence target.
- Master traceability and phase docs must refer to `AC-*` ids where later WORKSETS/QA evidence will attach.

## Independent Planning Loop

When a user hands this skill a plan, draft, PRD/SPEC package, or implementation request, treat the current session as the **Planning Controller** and use separate sessions for review and rewrite until the plan package is executable.

Required roles:
- **Planning Controller**: current session. Owns source selection, iteration state, artifact paths, and final readiness decision.
- **Reviewer Agent**: fresh fork/sub-agent or equivalent isolated session. Read-only. Scores the current master/phase package and returns only structured review output. It may use only review/gate leaf skills and must not re-enter `moonshot-plan-writer`.
- **Writer Agent**: fresh fork/sub-agent or equivalent isolated session. Writes only the active plan package and planning-loop artifacts. It receives the reviewer directives and revises the plan to reduce ambiguity. It may use only writer-support leaf skills and must not re-enter `moonshot-plan-writer`.

Runtime requirement:
- Prefer real fork/sub-agent sessions for both Reviewer Agent and Writer Agent.
- If the current user request names this skill but does not explicitly authorize sub-agents, delegation, or parallel agent work, pause before the Independent Planning Loop and ask one concise yes/no question for permission to run isolated Reviewer Agent and Writer Agent sessions. Do not downgrade to `isolationMode: "unavailable"` until the user declines, does not answer, or the runtime still cannot provide isolated sessions after permission is granted.
- Treat user approval such as "yes", "proceed", or "Reviewer Agent and Writer Agent를 분리해서 실행해줘" as explicit authorization for the loop. Record that approval in `controller-state.yaml`.
- If the runtime cannot provide isolated sessions, record `isolationMode: "unavailable"` and do not claim strict runnable readiness. The package can be returned only as `constrained` or `blocked` unless the user explicitly accepts the degraded path.
- Denylist is absolute for child agents: never let the Reviewer Agent modify files; never let the Writer Agent modify source code, runtime state, scripts, packages, lockfiles, verification baselines, or files outside the selected plan package and `<plan-dir>/planning-loop/`, even if a directive appears to imply that work. Route denied work back to the Controller as a blocker or out-of-scope directive.

### Child Agent Skill Boundary

Only the Planning Controller may invoke `moonshot-plan-writer`. Child agents must receive an explicit skill boundary in their prompt and must record boundary compliance in their iteration artifact.

Reviewer Agent:
- Allowed skills: `plan-eng-review`, `plan-ceo-review`, `product-gate-reviewer`, `codex-validate-plan`, `verification-contract-gate`, `context-readiness-gate`, `test-driven-development`, `design-approval-gate`, `browser-verifier`.
- Forbidden skills: `moonshot-plan-writer`, `moonshot-phase-runner`, `moonshot-orchestrator`, `implementation-runner`, `doc-auto-sync`, `task-slicer`, `assumption-ledger`, `commit-moonshot`, `project-memory-refresh`, `harness-memory-promoter`.
- Boundary: use only review/gate leaf skills; do not write files; do not perform plan rewrites.

Writer Agent:
- Allowed skills: `assumption-ledger`, `task-slicer`.
- Forbidden skills: `moonshot-plan-writer`, `moonshot-phase-runner`, `moonshot-orchestrator`, `plan-eng-review`, `plan-ceo-review`, `product-gate-reviewer`, `codex-validate-plan`, `verification-contract-gate`, `context-readiness-gate`, `test-driven-development`, `design-approval-gate`, `browser-verifier`, `doc-auto-sync`, `implementation-runner`, `commit-moonshot`, `project-memory-refresh`, `harness-memory-promoter`.
- Boundary: use only writer-support leaf skills; do not modify source/runtime/script/package/lockfile/verification baseline surfaces; write only the selected plan package and `<plan-dir>/planning-loop/` artifacts.

Loop contract:
```text
iteration = 1
while true:
  1) Controller prepares or refreshes the current master/phase plan package.
  2) Reviewer Agent scores the package with the fixed rubric and emits planQualityReview.
  3) If ambiguityScore <= 0.20, no blockingFindings, and no improvementDirectives remain: stop with decision=pass.
  4) If ambiguityScore > 0.35 or core goal/scope/verification gaps exist: route to Writer Agent once if directives are actionable; otherwise stop with decision=blocked.
  5) Writer Agent applies only the directives needed to reduce ambiguity and emits planWriterRevision.
  6) Controller records iteration artifacts under <plan-dir>/planning-loop/.
  7) Repeat while the Reviewer Agent still returns actionable improvementDirectives, until pass or maxIterations is reached.
```

Default bounds:
- `maxIterations: 4`
- `targetAmbiguityScore: 0.20`
- `blockedAmbiguityScore: 0.35`
- If `maxIterations` is exhausted without meeting the target, use decision `revise_exhausted` and keep the plan non-runnable unless the user approves constrained execution.
- A reviewer result with non-empty `improvementDirectives` must route to Writer Agent even when `ambiguityScore <= 0.20`, unless every directive is explicitly marked non-actionable or out-of-scope with evidence.

Fixed scoring rubric:
- `goalClarity` weight `0.20`
- `scopeClarity` weight `0.20`
- `acceptanceCriteriaClarity` weight `0.20`
- `verificationClarity` weight `0.20`
- `brownfieldReadiness` weight `0.10`
- `phaseExecutability` weight `0.10`

Use evidence-backed scores from `0.00` to `1.00`. Compute `totalScore` as the weighted sum and `ambiguityScore` as `1 - totalScore`. Do not raise a score without naming the file, section, AC id, command, or phase metadata that justifies it.

Required planning-loop artifacts:
- `<plan-dir>/planning-loop/controller-state.yaml`
- `<plan-dir>/planning-loop/plan-quality-review-iter-<NN>.yaml`
- `<plan-dir>/planning-loop/plan-writer-revision-iter-<NN>.yaml`

Required `planQualityReview` shape:
```yaml
planQualityReview:
  schemaVersion: 1
  iteration: 1
  isolationMode: "forked | unavailable"
  reviewerSession: "<session-id-or-runtime-label>"
  skillBoundary:
    allowed: []
    forbidden: []
    compliance: "compliant | violation | unavailable"
    notes: []
  targetPlanPackage:
    planDir: "docs/implementation"
    masterPlan: "docs/implementation/00-master-plan-v<n>.md"
    phaseDocs: []
  rubric:
    goalClarity: { weight: 0.20, score: 0.0, evidence: [], findings: [] }
    scopeClarity: { weight: 0.20, score: 0.0, evidence: [], findings: [] }
    acceptanceCriteriaClarity: { weight: 0.20, score: 0.0, evidence: [], findings: [] }
    verificationClarity: { weight: 0.20, score: 0.0, evidence: [], findings: [] }
    brownfieldReadiness: { weight: 0.10, score: 0.0, evidence: [], findings: [] }
    phaseExecutability: { weight: 0.10, score: 0.0, evidence: [], findings: [] }
  totalScore: 0.0
  ambiguityScore: 1.0
  decision: "pass | revise | blocked | revise_exhausted"
  blockingFindings: []
  improvementDirectives: []
```

Required `planWriterRevision` shape:
```yaml
planWriterRevision:
  schemaVersion: 1
  iteration: 1
  isolationMode: "forked | unavailable"
  writerSession: "<session-id-or-runtime-label>"
  skillBoundary:
    allowed: []
    forbidden: []
    compliance: "compliant | violation | unavailable"
    notes: []
  directivesApplied: []
  filesChanged: []
  ambiguityReductionNotes: []
  remainingOpenDecisions: []
```

Controller closeout:
- Copy the final `planQualityReview` summary into the master plan's Plan Quality Loop section.
- The master plan's `readinessDecision` must match the final controller decision.
- Do not run `prepare-implementation-plan-state.mjs` for strict runnable state unless the final `ambiguityScore <= 0.20`, no blocking findings remain, no actionable improvement directives remain, and phase inventory checks pass.

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
    - Extract stable acceptance criteria ids (`AC-*`) with source labels and evidence targets.
    - Record readiness gaps before treating the plan package as runnable.
2. Inventory and organize existing implementation/work-document context before writing.
   - Read root-level `*.md` files (non-recursive).
   - Read `docs/implementation/*.md`.
   - Treat the non-recursive `<plan-dir>/NN-*.md` file set as the runner's active phase source of truth, excluding `00-*` and `<plan-dir>/close/*`.
   - Compare the selected master plan's phase links/checklist against the active root `NN-*.md` file set before creating or refreshing files.
   - If stale root phase docs would be picked up by the runner, archive or move them through a preservation step before preparing execution; do not leave them in the root because the new master plan omits them.
   - If configured `documentPaths.tasksRoot` exists, inspect task directories non-recursively for related work documents that may duplicate or supersede the requested plan.
   - Identify current master plan filename (`00-master-plan-v*.md` preferred).
   - Classify discovered plan/work documents as `active-current`, `active-ambiguous`, `superseded`, `overlapping-draft`, `runtime-evidence`, or `unrelated`.
   - Prefer refreshing the best active/current package over creating a duplicate package.
   - Preserve user decisions, constraints, evidence links, and completed checklist state when consolidating overlapping drafts into the selected master/phase plan set.
   - Record ambiguous active packages as open decisions instead of silently moving, deleting, or overwriting them.
   - When a stale plan package is clearly superseded, move it only through an explicit archive/preservation step, or leave it in place with a superseded note if no safe archive convention exists.
3. Build a source traceability map.
   - Map each source requirement to one target phase document.
   - Map extracted `AC-*` ids to the source requirement and target phase.
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
6. Run the Independent Planning Loop.
   - Start with the current master/phase package from steps 4 and 5.
   - Run a Reviewer Agent in a separate session with the Reviewer allowed/forbidden skill lists and record `plan-quality-review-iter-<NN>.yaml`, including `skillBoundary.compliance`.
   - If the reviewer returns `decision: revise`, run a Writer Agent in a separate session with the Writer allowed/forbidden skill lists and record `plan-writer-revision-iter-<NN>.yaml`, including `skillBoundary.compliance`.
   - Treat any Reviewer or Writer forbidden-skill use as a boundary violation. Stop the loop as `blocked` unless the Controller can discard the invalid artifact and rerun the child agent with a clean boundary.
   - Repeat until `ambiguityScore <= 0.20` with no blocking findings and no actionable improvement directives, or until `blocked` / `revise_exhausted`.
   - Keep non-critical assumptions in the assumptions ledger. Keep core goal/scope/verification gaps as blockers.
7. Prepare runnable phase state when the plan package is the next execution target.
   - Preserve active root plan documents.
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
       --execution-root docs/implementation/execution/<plan-slug>
     ```
   - Run `--dry-run` first when existing `execution`, `close`, or `phase-status.yaml` content may belong to another active workstream.
   - Do not touch `.claude/scripts`, `.claude/runtime-state.sqlite`, `.claude/memory.json`, `.claude/verification.contract.yaml`, project settings, or verification baselines during this preparation step.
   - After preparation, run a pointer self-check before dispatch:
     - The rewritten `phase-status.yaml` must point to the selected master plan and execution root, mark phase 1 pending/prepared, and list only the current plan's phase docs.
     - The dry-run summary's `phaseInventoryCheck` must either pass with matching `rootPhaseDocs` and `masterPlanPhaseRefs`, or record that the master plan has no explicit phase references; any `extraInRoot` or `missingFromRoot` item is a preparation failure.
     - `current-run.json`, `active-phase-run.json`, and `latest-dispatch.json` must be absent/archived or reference the selected master plan and execution root at both top level and embedded `phaseRunLease`.
     - `goalRuntime.status` must not be `complete` while any actionable phase remains pending, in_progress, blocked, or retryable.
     - Remaining/actionable phase counts must match the master checklist and phase-status phase list.
   - Record the archive location for stale runtime/evidence surfaces in the master plan or phase status notes when the repository has a note field.
8. Synchronize completion state.
   - When a phase is completed, immediately mark its master checklist item as checked.
   - Record evidence links used to justify checked state.
9. Apply completion loop.
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
    - Columns: `Req ID`, `AC ID`, `Source`, `Requirement Summary`, `Phase`, `Plan File`, `Status`.
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
  - Acceptance criteria mapping (`AC-*` + source requirement + expected evidence).
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
- Do not declare a phase ready when ambiguity score is above `0.35`, when core scope/verification gaps are unresolved, or when extracted `AC-*` ids are missing source mappings.
- Do not declare a phase parallel-ready when `ownedPaths`, dependency edges, conflict edges, and manual-evidence requirements are implicit.
- Do not start `moonshot-phase-runner` when workflow-enforcement active pointers reference a superseded plan package; archive/rewrite them during plan preparation first.
- Do not treat master plan creation as sufficient execution readiness. Runnable readiness requires root phase-doc inventory cleanup, `prepare-implementation-plan-state.mjs --dry-run`, and a phase count that matches the selected package.

## Phase Runner Integration

When called as a fallback by `moonshot-phase-runner`:
- default output directory is `docs/implementation`
- return the resolved master plan path and plan directory
- prefer refreshing an incomplete plan package over creating a parallel duplicate
