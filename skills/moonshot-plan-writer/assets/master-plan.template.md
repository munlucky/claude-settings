# <Project> Master Plan v<version>

> This document is the plan of all plans.

## Source Baseline
- `<source-doc-1.md>` (role: scope/priority)
- `<source-doc-2.md>` (role: technical contract)
- `<source-doc-3.md>` (role: experience/interaction)

## Objective
- <overall objective>

## Execution Metadata
```yaml
executionMetadata:
  projectId: "<resolved by scripts/project-identity.mjs>"
  planRootMode: "account_project_planning | tracked_source_design"
  planRoot: "{planRoot}"
  accountPlanningRoot: "${MOONSHOT_RELAY_HOME:-~/.moonshot-relay}/state/projects/<projectId>/planning/packages"
  sourceDesignFallback: "docs/implementation/<plan-slug>"
```

- Default to `account_project_planning`. Use `tracked_source_design` only when the operator explicitly asks to commit the plan package as source.
- Project separation is by `projectId`; do not share a generic account-root planning directory across repositories.

## Adoption Surface Classification
```yaml
adoptionSurface:
  schemaVersion: 1
  policySourcePaths:
    - "<root instructions, verification contract, deployment runbook, package contract, or migration policy>"
  surfaces:
    - id: "<stable-surface-id>"
      category: "source_only | package_runtime_payload | installed_profile_or_account_root | external_deployment_or_service | data_or_state_migration"
      plannedMutation: "<what changes, or none>"
      controlledAdoptionPhase: "<NN or none>"
      liveMutationPolicy: "forbidden | dry_run_only | controlled_phase_only | allowed_with_policy_gate"
      policyGateRefs:
        - "<policy section, command id, checklist id, or missing-policy>"
      requiredEvidenceSlots:
        - "preflight_or_dry_run"
        - "independent_review"
        - "targeted_tests"
        - "build_or_package_verification"
        - "post_adoption_verification"
        - "rollback_or_recovery_evidence"
        - "git_closeout_parity"
      concreteGateCommands:
        source: "project_policy | phase_plan | not_applicable | missing_policy"
        commands: []
  unresolvedPolicyGaps: []
```

- Keep this section project-neutral. Do not hard-code another repository's harness, package, installer, profile-parity, deployment, or migration commands.
- Concrete gate commands must be copied from the target project's policy sources or recorded as `missing_policy`.
- A non-source-only surface without policy source paths and required evidence slots blocks execution readiness.

## Plan Quality Loop
```yaml
planQualityReview:
  schemaVersion: 1
  finalIteration: <n>
  isolationMode: "forked | unavailable"
  maxIterations: 4
  targetAmbiguityScore: 0.20
  blockedAmbiguityScore: 0.35
  totalScore: 0.0
  ambiguityScore: 1.0
  decision: "pass | revise | blocked | revise_exhausted"
  reviewerSessions: []
  writerSessions: []
  artifactRoot: "{planRoot}/planning-loop"
  latestReview: "{planRoot}/planning-loop/plan-quality-review-iter-<NN>.yaml"
  latestWriterRevision: "{planRoot}/planning-loop/plan-writer-revision-iter-<NN>.yaml"
  blockingFindings: []
  remainingImprovementDirectives: []
  remainingOpenDecisions: []
```

- Strict runnable readiness requires `ambiguityScore <= 0.20`, no blocking findings, no actionable improvement directives, and forked reviewer/writer evidence unless the user explicitly approves degraded isolation.
- Keep iteration artifacts under this plan package's `planning-loop/` directory.

## Plan Package Readiness
```yaml
planPackageReadiness:
  mode: "prepared_now | prep_phase_required | docs_only | blocked"
  selectedMasterPlan: "{planRoot}/00-master-plan-v<version>.md"
  selectedPhaseDocs:
    - "{planRoot}/01-<slug>-v<version>.md"
  staleRootPhaseDocs: []
  staleMasterPlans: []
  dirtyWorktreeAction: "none | classify_before_edit | blocked_unknown_owner"
  runtimePointerAction: "none | archive_before_dispatch | blocked_active_workstream"
  archiveRoot: "{planRoot}/archive/"
  dryRunCommand: "node scripts/prepare-phase-runner-state.mjs --dry-run --json --plan-dir {planRoot} --master-plan {planRoot}/00-master-plan-v<version>.md --status-file .moonshot-relay/docs/phase-status.yaml"
  executionRootPolicy: "default_account_project_execution_root"
  readinessDecision: "runnable | prep_phase_required | docs_only | blocked"
```

- If `mode: prep_phase_required`, the first unchecked checklist item must be a readiness phase that archives/preserves stale roots, classifies dirty paths, runs dry-run preparation, and performs pointer self-checks before implementation phases.
- If `mode: docs_only`, do not present this package as ready for `moonshot-phase-runner`.

## MVP Methodology
```yaml
mvpMethodology:
  profile: "none | demo_first"
  requiredExecutionPack:
    - MVP_SCOPE.md
    - MINI_ARCHITECTURE.md
    - UI_DEMO_PLAN.md
    - UI_FLOW_MAP.md
    - UI_STATE_MATRIX.md
    - MOCK_SCENARIOS.md
    - MOCK_API_CONTRACT.md
    - USER_DEMO_TEST.md
    - DEMO_EVIDENCE.md
    - USER_DEMO_APPROVAL.md
    - POST_DEMO_IMPLEMENTATION_PLAN.md
    - UI_CHANGE_REQUEST.md
```

- Use `demo_first` only when the MVP must hard-stop after clickable/mock demo evidence until user approval.
- For `demo_first`, every in-scope slice must progress through demo evidence, user approval, Real Functional, and Real Functional Verification before this plan can complete.

## Phase Index
| Phase | Title | Plan File | Depends On |
|------|-------|-----------|------------|
| 01 | <title> | `{planRoot}/01-<slug>-v<version>.md` | - |

## Execution Order Notes
- <dependency and ordering notes>

## Parallel Execution Plan
| Wave | Phases | Eligibility | Blockers / Notes |
|------|--------|-------------|------------------|
| wave-1 | 01, 02 | parallel | disjoint `ownedPaths`; no shared mutable writes |
| sequential | 03 | sequential | depends on wave-1 completion |

- Phase-level parallel execution is allowed only when each phase has explicit `Phase Execution Metadata`.
- Sequential phases must record the blocker reason instead of relying on implicit ordering.

## Source Traceability Matrix
| Req ID | Source | Requirement Summary | Phase | Plan File | Status |
|--------|--------|---------------------|-------|-----------|--------|
| SRC-<n> | <source-name> | <summary> | <NN> | `{planRoot}/<NN>-<slug>-v<version>.md` | mapped |

## Unmapped Source Requirements
- <none or explicit gap list with reason>

## Phase Completion Checklist
- [ ] Phase 01 - <title> (`{planRoot}/01-<slug>-v<version>.md`)
- [ ] Phase 02 - <title> (`{planRoot}/02-<slug>-v<version>.md`)

## Completion Rule
- Mark a phase as checked only when its phase plan completion criteria are satisfied.
- Do not leave source requirements unmapped without explicit decision notes.
- Do not declare full completion when a non-source-only surface lacks policy-sourced adoption evidence.
- Do not declare full completion until every checklist item is checked.
