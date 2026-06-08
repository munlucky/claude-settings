# Moonshot Relay Harness Cleanup Contract Hardening - Master Plan v1

## Objective

Create an execution-ready cleanup plan that moves repeated prompt safety policy into machine-checkable owners while preserving Moonshot Relay's runtime authority model.

This package supersedes `docs/implementation/harness-surface-simplification-2026-06-08/` for execution. The older package remains historical input only.

## Scope

In scope:

- Replace direct active Git child-process calls with a shared safe helper.
- Classify runtime-state open/setup failures into typed degraded reasons.
- Split observability team metrics into decision fields and reporting fields while preserving compatibility.
- Collapse duplicated prompt evidence gates into completion-verifier/runtime-state authority.
- Keep profile-local runtime skill discovery at 6 skills, including the user-invoked `moonshot-plan-writer` entrypoint.
- Define final validation readiness across required verification planes.

Out of scope:

- Live account-root install mutation.
- Deleting compatibility skills from canonical `skills/**`.
- Relaxing `runtime-state.mjs assess-completion` completion authority.
- Rewriting unrelated runtime, prompt, or package architecture.

## Plan Package

```yaml
packageRoot: docs/implementation/harness-cleanup-contract-hardening-2026-06-08
masterPlan: docs/implementation/harness-cleanup-contract-hardening-2026-06-08/00-master-plan-v1.md
phaseDocs:
  - docs/implementation/harness-cleanup-contract-hardening-2026-06-08/01-git-safe-child-process-v1.md
  - docs/implementation/harness-cleanup-contract-hardening-2026-06-08/02-runtime-error-classifier-v1.md
  - docs/implementation/harness-cleanup-contract-hardening-2026-06-08/03-observability-contract-fields-v1.md
  - docs/implementation/harness-cleanup-contract-hardening-2026-06-08/04-prompt-gate-surface-v1.md
  - docs/implementation/harness-cleanup-contract-hardening-2026-06-08/05-runtime-skill-package-surface-v1.md
  - docs/implementation/harness-cleanup-contract-hardening-2026-06-08/06-final-validation-readiness-v1.md
reviewArtifacts:
  - docs/implementation/harness-cleanup-contract-hardening-2026-06-08/planning-loop/plan-quality-review-iter-01.yaml
  - docs/implementation/harness-cleanup-contract-hardening-2026-06-08/planning-loop/accepted-change-directives-v1.yaml
relationship:
  selectedExecutionPackage: docs/implementation/harness-cleanup-contract-hardening-2026-06-08
  supersedesForExecution:
    - docs/implementation/harness-surface-simplification-2026-06-08
  extendsRequirementsFrom:
    - docs/implementation/harness-surface-simplification-2026-06-08/01-legacy-archive-contract-split-v1.md
    - docs/implementation/harness-surface-simplification-2026-06-08/02-phase-projection-terminology-v1.md
    - docs/implementation/harness-surface-simplification-2026-06-08/03-task-local-completion-read-model-v1.md
    - docs/implementation/harness-surface-simplification-2026-06-08/04-completion-verifier-surface-v1.md
    - docs/implementation/harness-surface-simplification-2026-06-08/05-runtime-skill-surface-v1.md
readinessDecision: runnable_after_phase_runner_prepare
liveMutationPolicy: no_live_account_root_mutation
```

## Phase Index

| Phase | Title | Plan File | Depends On |
|---|---|---|---|
| 01 | Git-Safe Child Process | `01-git-safe-child-process-v1.md` | - |
| 02 | Runtime Error Classifier | `02-runtime-error-classifier-v1.md` | 01 |
| 03 | Observability Contract Fields | `03-observability-contract-fields-v1.md` | 02 |
| 04 | Prompt/Gate Surface | `04-prompt-gate-surface-v1.md` | 03 |
| 05 | Runtime Skill Package Surface | `05-runtime-skill-package-surface-v1.md` | 04 |
| 06 | Final Validation Readiness | `06-final-validation-readiness-v1.md` | 01, 02, 03, 04, 05 |

## Execution Order

Execute phases sequentially. The write sets intentionally overlap in shared tests and public docs, so parallel execution is not the default. If phases are delegated to independent agents, the parent session must merge edits and rerun the phase-specific verification commands before closing the phase.

## Source Traceability Matrix

| Req ID | Requirement | Phase | Acceptance Evidence |
|---|---|---|---|
| HC-01 | Raw Git calls must tolerate dubious ownership and centralize safe.directory handling. | 01 | Git helper tests and direct-call `rg` allow only `scripts/lib/git-safe.mjs`. |
| HC-02 | Runtime-state degraded status must distinguish permission, sandbox, lock, schema, path, and native-module failures. | 02 | Classifier tests and `runtime-state status --json` typed degraded evidence. |
| HC-03 | Observability metrics must separate decision-critical fields from reporting fields without breaking existing contract consumers. | 03 | Contract tests preserve `requiredFields` and assert `decisionFields`/`reportingFields`. |
| HC-04 | Evidence gate prompt duplication must move under completion-verifier and runtime-state authority. | 04 | Workflow bundle tests show no active `verification-evidence-gate` strict insert. |
| HC-05 | Runtime profile discovery must expose 6 public skills and keep `moonshot-plan-writer` in Claude/Codex profile payloads. | 05 | Package/plugin/materialization tests compare against `package/runtime-surface.json`. |
| HC-06 | Final closeout must map evidence to unit, package, eval, installer, browser, security, and quality planes. | 06 | Final validation matrix and completion authority checks are recorded. |

## Plan Quality Loop

```yaml
planQualityReview:
  schemaVersion: 1
  finalIteration: 1
  reviewerSession:
    name: Lorentz
    role: independent_plan_reviewer
    decision: revise
  improverSession:
    name: Pauli
    role: independent_plan_improver
  parentSession:
    role: main_session_plan_owner
    decision: accepted_with_parent_edits
  artifactRoot: docs/implementation/harness-cleanup-contract-hardening-2026-06-08/planning-loop
  latestReview: docs/implementation/harness-cleanup-contract-hardening-2026-06-08/planning-loop/plan-quality-review-iter-01.yaml
  acceptedDirectives: docs/implementation/harness-cleanup-contract-hardening-2026-06-08/planning-loop/accepted-change-directives-v1.yaml
  blockingFindingsAfterParentEdits: []
  remainingAmbiguity: []
```

## Non-Negotiables

- `runtime-state.mjs assess-completion` accepted verdict remains the whole-plan clean completion authority.
- `phase-status.yaml` remains a cursor/projection, not completion authority.
- `completion-verifier` output shape remains compatible.
- `observability.teamMetrics.requiredFields` remains available as deprecated compatibility.
- `moonshot-plan-writer` remains in Claude/Codex profile-local public discovery because it is a user-invoked planning entrypoint.
- Live account-root install sync is not performed by this plan.

## Final Validation

Run phase-local commands first, then the final matrix in Phase 06:

- `npm test`
- `npm run test:package`
- `npm run test:eval`
- `node package/build-package.mjs --runtime all --dry-run --json`
- `node scripts/install-account-root-harness.mjs --runtime all --dry-run --json`
- `git diff --check`
- objective `rg` checks listed in `06-final-validation-readiness-v1.md`

## Completion Rule

Do not claim whole-plan clean completion from markdown files, phase-status, verifier JSON, or passing focused tests alone. Whole-plan clean completion requires final validation evidence and `scripts/runtime-state.mjs assess-completion --json` returning `accepted`.
