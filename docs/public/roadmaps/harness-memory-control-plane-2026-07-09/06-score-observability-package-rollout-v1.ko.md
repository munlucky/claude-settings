# Phase 06: Score Observability, Package, and Account-Root Rollout v1

## Goal

Move the memory control-plane implementation from source contracts to controlled rollout only after score policy, observability, package verification, and account-root adoption evidence are ready.

## Source Mapping

| Req ID | Source Section | Requirement Summary | This Phase Handling |
|---|---|---|---|
| REQ-MEM-005 | uploaded research section 6 | Memory quality should affect score. | Add measured score inputs and observability metrics. |
| REQ-MEM-006 | uploaded research sections 7, 10 | Start file-first, then optional graph backend, then ontology expansion. | Gate source -> package -> account-root -> external backend rollout. |
| SCN-MEM-003 | memory-promotion tests | Rollback and stale projection must work. | Require rollback and stale projection evidence before adoption. |

## Expected Outcome

- Score policy inputs for memory retrieval precision, provenance coverage, stale suppression, unauthorized access, candidate-as-fact violations, and PII/security violations.
- Observability metrics for stale memory warnings, prompt omissions, memory gate failures, promotion denials, rollback/supersession, and repeated-failure replan.
- A controlled rollout checklist for source, package payload, temp install, live account-root, and optional external backend.
- Explicit blockers for external graph backend and runtime-state migration policy until ADR/security/migration evidence exists.

## Phase Execution Metadata

```yaml
phaseExecution:
  schemaVersion: 1
  parallelEligible: false
  parallelGroup: "wave-5"
  dependsOn:
    - "02-evidence-episode-ledger-v1.ko.md"
    - "03-stage-scoped-retrieval-and-context-packs-v1.ko.md"
    - "04-task-evidence-graph-ontology-verify-gates-v1.ko.md"
    - "05-eval-failure-and-procedural-memory-v1.ko.md"
  conflictsWith:
    - "Any live account-root or external graph backend write before source/package/eval evidence exists."
  ownedPaths:
    - "planned: tests/score-policy-contract.test.mjs"
    - "planned: tests/observability-metrics-contract.test.mjs"
    - "planned: tests/package-materialization.test.mjs"
    - "planned: docs/public/guidelines/memory-control-plane-rollout.md"
    - "package/build-package.mjs"
    - "scripts/install-account-root-harness.mjs"
    - "skills.lock.json"
    - "docs/public/roadmaps/harness-memory-control-plane-2026-07-09/06-score-observability-package-rollout-v1.ko.md"
  readOnlyPaths:
    - "package.json"
    - "package/**"
    - "bin/moonshot-relay.mjs"
    - "C:/Users/moon/.moonshot-relay/**"
    - "C:/Users/moon/.claude/**"
    - "C:/Users/moon/.codex/**"
    - "C:/Users/moon/.qwen/**"
  sharedMutablePaths: []
  surfaceClassifications:
    - surfaceId: "memory-control-plane-source"
      category: "source_only"
      policySourcePaths:
        - "AGENTS.md"
        - "schemas/verification.contract.yaml"
        - "package.json"
      requiredEvidenceSlots:
        - "targeted_tests"
        - "independent_review"
        - "git_closeout_parity"
      concreteGateCommandsSource: "project_policy"
    - surfaceId: "memory-control-plane-package-runtime"
      category: "package_runtime_payload"
      policySourcePaths:
        - "package.json files"
        - "package.json scripts.test:package"
      requiredEvidenceSlots:
        - "build_or_package_verification"
        - "package_materialization_diff"
        - "generated_state_exclusion"
      concreteGateCommandsSource: "project_policy"
    - surfaceId: "memory-control-plane-installed-account-root"
      category: "installed_profile_or_account_root"
      policySourcePaths:
        - "AGENTS.md"
        - "missing-policy: exact install parity command at implementation time"
      requiredEvidenceSlots:
        - "preflight_or_dry_run"
        - "post_adoption_verification"
        - "rollback_or_recovery_evidence"
        - "git_closeout_parity"
      concreteGateCommandsSource: "missing_policy"
    - surfaceId: "memory-control-plane-external-graph-backend"
      category: "external_deployment_or_service"
      policySourcePaths:
        - "missing-policy: backend ADR, secret/PII policy, migration and rollback runbook"
      requiredEvidenceSlots:
        - "architecture_decision"
        - "security_privacy_review"
        - "migration_dry_run"
        - "rollback_or_recovery_evidence"
      concreteGateCommandsSource: "missing_policy"
  requiresManualEvidence: true
  mergePolicy: "controlled_rollout_only"
```

## Rollout Gates

| Gate | Required Evidence | Blocks |
|---|---|---|
| source gate | targeted tests, `npm test`, independent review | package/runtime claims |
| score/observability gate | score policy tests and metrics exposure | rollout readiness |
| eval gate | `npm run test:eval` or specific harness-control-plane eval fixture when implemented | promotion and rollout |
| package gate | `npm run test:package`, generated-state exclusion proof | package publish/install claims |
| temp install gate | temp-home install and parity evidence | live account-root adoption |
| live account-root gate | explicit user/operator approval, install parity, doctor/audit, rollback plan | completion of installed adoption |
| external backend gate | ADR, security/privacy review, migration dry-run, rollback runbook | Graphiti/Neo4j/MCP production backend |

## Detailed Work

| ID | Work | Steps | Completion Criteria |
|---|---|---|---|
| P06-1 | Score integration | Add measured memory quality dimensions that consume verification/eval outputs. | Score cannot be self-reported. |
| P06-2 | Observability metrics | Expose stale warnings, omission counts, memory gate failures, denial counts, rollback/supersession, repeated-failure replan. | Runtime status or metrics path reports memory health. |
| P06-3 | Package payload proof | Verify new scripts/schemas/docs are included and generated state excluded. | Package tests pass. |
| P06-4 | Account-root adoption runbook | Define exact preflight, install, parity, doctor/audit, rollback evidence at implementation time. | Missing command policy remains blocker until resolved. |
| P06-5 | External backend ADR gate | Prepare ADR template and blocker for backend selection. | No external backend work starts without ADR/security/migration evidence. |

## Exact Execution Targets

| ID | Create Files | Modify Files | Test Files | Commands | Expected Signal |
|---|---|---|---|---|---|
| P06-1 | none | score policy implementation path identified during Phase 01 | `tests/score-policy-contract.test.mjs` | `node --test tests/score-policy-contract.test.mjs` | Memory score cannot be self-reported. |
| P06-2 | none | observability/status implementation path identified during Phase 01 | `tests/observability-metrics-contract.test.mjs` | `node --test tests/observability-metrics-contract.test.mjs` | Memory health fields are exposed. |
| P06-3 | none | `package/build-package.mjs`, `package.json`, package templates only if new source files must ship | `tests/package-materialization.test.mjs` | `npm run test:package` | Source support files materialize; generated state is excluded. |
| P06-4 | `docs/public/guidelines/memory-control-plane-rollout.md` | installer docs/scripts only after policy gap closes | package/install tests identified during implementation | `npm run test:package` | Adoption runbook has evidence slots and rollback. |
| P06-5 | `planned: docs/public/architecture/ADR-memory-backend-selection.md` | none | none | review-only | Backend remains forbidden until ADR accepted. |

## Verification Plan

- [ ] `npm test`
- [ ] `npm run test:eval`
- [ ] `npm run test:package`
- [ ] `node --test tests/score-policy-contract.test.mjs`
- [ ] `node --test tests/observability-metrics-contract.test.mjs`
- [ ] Harness Lab status and result path when implementation changes workflow/runtime behavior.
- [ ] Installed-root parity only after explicit controlled adoption approval.

## Completion Evidence

- Score policy test output.
- Observability metric test output.
- Package materialization output.
- Temp/live adoption evidence or explicit blocked status.
- External backend ADR status.
- Rollback evidence for memory claims and context projections.

## Handoff Notes

This phase is the first phase that may touch package/runtime or installed-account-root surfaces. If the implementation team cannot source exact install parity commands from current policy at that time, the phase must remain blocked rather than inventing commands.
