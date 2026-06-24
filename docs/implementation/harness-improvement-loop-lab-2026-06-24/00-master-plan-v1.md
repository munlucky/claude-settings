# Harness Improvement Loop Lab - Master Plan v1

## Scope Status

Status: reviewed-foundation-batch-plan-ready

This package plans the next Moonshot Relay harness improvement loop environment. The goal is to make harness changes measurable, reversible, and isolated before any product-level harness expansion or live account-root adoption.

Independent review found that Phase 01 alone is not enough to satisfy the user's three required outcomes. The first executable foundation is therefore Phases 01-03 together: shared quantitative result contract, same-input fixture scoring, and account-root isolation guard. Phase 04 adds SWE-bench adapter readiness after the local foundation is machine-checkable.

## Objective

Upgrade the current `harness-lab` from an external command gate into a quantitative improvement loop environment:

```text
baseline capture
candidate execution
metric and artifact scoring
stable/candidate comparison
promotion or rollback decision
result preservation
```

The first implementation target is not a full SWE-bench clone. The target is a local, source-controlled H0 lab that can prove whether a harness change improves, preserves, or regresses the same input workload without mutating the user's installed `.moonshot-relay`, `.codex`, or `.claude` account roots.

## Source Inputs

| Input | Role | Status |
|---|---|---|
| `tools/harness-lab/harness-lab.mjs` | Current external bootstrap lab and candidate/stable execution wrapper | active implementation target |
| `tools/evals/harness-control-plane.mjs` | Existing JSON-producing control-plane eval with `score`, `passedCount`, `failedCount`, and `totalCount` | active metric source |
| `tests/harness-lab-contract.test.mjs` | Current H0 contract test surface | active test target |
| `docs/public/guidelines/harness-bootstrap-lab.md` | Public operating contract for `authority: "external-bootstrap-lab"` | active documentation target |
| `package/package-contract.yaml` | Canonical source/package/profile boundary and account-root mutation policy | active policy source |
| `schemas/verification.contract.yaml` | Verification contract source materialized into runtime profiles | active policy source |
| `docs/implementation/evidence-driven-agent-harness-2026-06-23/` | Prior evidence-driven harness design and authority constraints | reference input |
| `docs/implementation/ponytail-harness-adoption-2026-06-24/05-validation-metrics-and-rollout-v1.md` | Recent local metric/rollout concerns | reference input |
| Research summary: `2026-06-24-harness-loop-engineering-v2` | Public harness/loop engineering references and comparison axes | reference input, not runtime authority |

## Non-Negotiables

- `harness-lab` remains H0 authority. Candidate harness output is evidence input only.
- `runtime-state.sqlite` remains Moonshot Relay workflow/completion authority for normal workflow completion decisions.
- The improvement lab must not write to the real `%USERPROFILE%\.moonshot-relay`, `%USERPROFILE%\.codex`, or `%USERPROFILE%\.claude` roots.
- Every lab run must override `MOONSHOT_RELAY_HOME` and `PHASE_RUNTIME_DB` into the run root.
- Same-input comparison requires matching `fixtureId` and `inputHash`. A stable/candidate comparison with mismatched fixture identity must fail with `failureClass: "fixture_identity_mismatch"`.
- Any `.codex` or `.claude` profile behavior must be tested through dry-run, fixture, or temp-home execution before live adoption is considered.
- SWE-bench is an external verifier integration target, not a replacement for Moonshot Relay's H0 authority. A fake SWE-bench-like fixture proves adapter contract shape only; it does not satisfy real SWE-bench readiness unless a dependency decision selects real execution or the user explicitly accepts a deferred real run.
- Promotion must be blocked by metric threshold failures, metric regressions, account-root contamination, or missing required artifacts even when commands exit with code 0.
- Plan execution starts with source-only changes. Package/runtime payload and installed profile/account-root mutation remain separate controlled phases.

## Plan Package Readiness

```yaml
planPackageReadiness:
  schemaVersion: 1
  status: reviewed_foundation_batch_plan_ready
  planRoot: docs/implementation/harness-improvement-loop-lab-2026-06-24
  selectedMasterPlan: docs/implementation/harness-improvement-loop-lab-2026-06-24/00-master-plan-v1.md
  selectedPhaseDocs:
    - docs/implementation/harness-improvement-loop-lab-2026-06-24/01-quantitative-lab-result-schema-v1.md
    - docs/implementation/harness-improvement-loop-lab-2026-06-24/02-fixed-fixture-corpus-and-artifact-scorer-v1.md
    - docs/implementation/harness-improvement-loop-lab-2026-06-24/03-account-root-isolation-and-rollback-guard-v1.md
    - docs/implementation/harness-improvement-loop-lab-2026-06-24/04-swe-bench-adapter-v1.md
    - docs/implementation/harness-improvement-loop-lab-2026-06-24/05-improvement-loop-operation-and-promotion-v1.md
  reviewArtifacts:
    - docs/implementation/harness-improvement-loop-lab-2026-06-24/planning-loop/plan-quality-review-iter-01.yaml
    - docs/implementation/harness-improvement-loop-lab-2026-06-24/planning-loop/independent-reviewer-a.md
    - docs/implementation/harness-improvement-loop-lab-2026-06-24/planning-loop/independent-reviewer-b.md
    - docs/implementation/harness-improvement-loop-lab-2026-06-24/planning-loop/improvement-agent.md
    - docs/implementation/harness-improvement-loop-lab-2026-06-24/planning-loop/plan-quality-review-iter-02.yaml
    - docs/implementation/harness-improvement-loop-lab-2026-06-24/planning-loop/per-document-review-iter-02.yaml
  executionReadiness: phase_01_02_03_foundation_batch_ready_after_plan_update
  readinessDecision: "Phases 01-03 form the minimum foundation batch. Phase 01 can start first, but the user-facing environment is not complete until quantitative schema, fixture identity scoring, and account-root isolation guard all pass. SWE-bench adapter remains blocked until local fixture scoring is stable and external dependency policy is selected."
  graphReadiness: markdown_only_not_dag_validated
  executionAuthority: "This is a Markdown plan package. It does not claim validated plan-graph execution readiness."
```

## Runner Contract

```yaml
runnerContract:
  mode: source_first_foundation_batch
  activePhase: "01"
  runnablePhases:
    - "01"
    - "02"
    - "03"
  phase01CloseoutGate:
    requires:
      - "shared lab-result v1 contract"
      - "canonical failureClass enum"
      - "metric parsing, threshold, and maxRegression rules"
      - "minimum accountRootGuard result fields reserved in lab-result.json"
  foundationBatchCloseout:
    requiresPhases:
      - "01"
      - "02"
      - "03"
    reason: "Quantitative comparison is not meaningful until same fixture identity and account-root isolation are machine-checkable."
  blockedPhases:
    - phase: "04"
      until:
        - "Phase 02 fixture scorer is stable."
        - "Phase 03 account-root guard passes."
        - "SWE-bench execution mode is selected: local docker, external installed harness, or documented skipped dependency."
    - phase: "05"
      until:
        - "Phases 01-03 produce passing lab evidence."
  phaseCloseoutRequiredForEveryExecutedPhase:
    - "execution/phase-XX/SCORECARD.md"
    - "execution/phase-XX/QA_REPORT.md"
    - "execution/phase-XX/HANDOFF.md"
    - "execution/phase-XX/lab-result-reference.md"
```

## Phase Index

| Phase | Title | Plan File | Depends On | Execution Readiness |
|---|---|---|---|---|
| 01 | Quantitative Lab Result Schema | `01-quantitative-lab-result-schema-v1.md` | - | foundation batch runnable |
| 02 | Fixed Fixture Corpus and Artifact Scorer | `02-fixed-fixture-corpus-and-artifact-scorer-v1.md` | 01 shared schema | foundation batch runnable after schema shape is accepted |
| 03 | Account-Root Isolation and Rollback Guard | `03-account-root-isolation-and-rollback-guard-v1.md` | 01 guard fields | foundation batch runnable after guard fields are accepted |
| 04 | SWE-bench Adapter | `04-swe-bench-adapter-v1.md` | 01, 02, 03 | blocked on local scorer and dependency decision |
| 05 | Improvement Loop Operation and Promotion | `05-improvement-loop-operation-and-promotion-v1.md` | 01, 02, 03; 04 optional | blocked until quantitative gates exist |

## Phase Boundary Summary

| Phase | Primary Write Boundary | Conflict Boundary | Adoption Target |
|---|---|---|---|
| 01 | `tools/harness-lab/harness-lab.mjs`, `tests/harness-lab-contract.test.mjs`, `docs/public/guidelines/harness-bootstrap-lab.md` | Must not mutate account-root profiles or package payload beyond documented source allowlist changes | Source-only quantitative gate |
| 02 | `tools/evals/**`, `tests/fixtures/**`, `schemas/**`, `docs/public/guidelines/**` | Must not rely on live user documents or unpinned external data | Source-only fixture/scorer corpus |
| 03 | `tools/harness-lab/**`, `tests/**`, optional temp-home guard fixtures | Must not write to real `%USERPROFILE%` profile roots | Source-only isolation guard |
| 04 | `tools/adapters/**` or `tools/evals/**`, optional docs and tests | Must not vendor or execute external SWE-bench dependencies without explicit dependency decision | External verifier adapter, initially optional |
| 05 | `docs/public/guidelines/**`, optional report templates, tests | Must not perform live install or package adoption without explicit approval | Operating model and promotion policy |

## Surface Classification

| Surface | Classification | In Scope | Policy Source Paths | Required Evidence Slots |
|---|---|---|---|---|
| `tools/harness-lab/harness-lab.mjs` | `source_only` | yes | `AGENTS.md`, `package/package-contract.yaml` | contract test, eval test, `npm run test:lab`, persisted `lab-result.json` |
| `tests/harness-lab-contract.test.mjs` | `source_only` | yes | `AGENTS.md`, `package/package-contract.yaml` | targeted Node test, failure-mode coverage |
| `docs/public/guidelines/harness-bootstrap-lab.md` | `source_only` | yes | `AGENTS.md`, `package/package-contract.yaml` | doc grep, package doc exposure test |
| Fixture corpus and scorers | `source_only` | yes | `AGENTS.md`, `package/package-contract.yaml` | deterministic fixture output, artifact hash, scorer JSON |
| Package payload allowlist | `package_runtime_payload` | not in Phase 01; possible later only if new files must ship | `package/package-contract.yaml` | package dry-run, package layout test, runtime-surface review |
| Installed `.moonshot-relay`, `.codex`, `.claude` | `installed_profile_or_account_root` | explicitly out of Phase 01-04 live mutation | `package/package-contract.yaml`, `AGENTS.md` | pre/post fingerprint guard, temp-home smoke, live approval if ever selected |
| SWE-bench execution environment | `external_deployment_or_service` | adapter planning only until dependency decision | `AGENTS.md`, future dependency decision note | dependency pin, sandbox mode, external verifier result, skip reason if unavailable |
| Lab run outputs under `.moonshot-relay/harness-lab-runs` | `data_or_state_migration` | generated run state only, not committed source | `package/package-contract.yaml` excluded generated state | run-root evidence path, cleanup/retention note |

## Shared Result Contract

All phases that write or consume lab evidence must use the same result vocabulary.

```yaml
labResultContract:
  schemaVersion: "moonshot-harness-lab-result.v1"
  authority: "external-bootstrap-lab"
  requiredTopLevelFields:
    - schemaVersion
    - authority
    - run
    - candidate
    - quantitative
    - accountRootGuard
    - promotion
  failureClassEnum:
    - none
    - command_exit
    - timeout
    - stdout_json_parse
    - metric_missing
    - metric_threshold
    - metric_regression
    - fixture_identity_mismatch
    - artifact_missing
    - artifact_schema_invalid
    - scorer_parse_failure
    - account_root_contamination
    - account_root_guard_unavailable
    - swe_bench_dependency_missing
    - swe_bench_verifier_failure
    - external_dependency_skipped
    - promotion_state_invalid
  promotionRule:
    candidateOnlyRun: "smoke evidence only; cannot claim improvement"
    improvementClaimRequires:
      - baselineRunId
      - candidateRunId
      - fixtureSetId
      - scorerVersion
      - matching fixtureId and inputHash
      - accountRootGuard.status == passed
```

## Source Traceability Matrix

| Req ID | Requirement Summary | Phase | Acceptance Evidence |
|---|---|---|---|
| HIL-REQ-01 | Same suite output can be compared quantitatively across baseline and candidate. | 01 | `lab-result.json.quantitative` includes suite metrics, thresholds, and stable/candidate deltas. |
| HIL-REQ-01a | Stable and candidate comparisons must reference identical `fixtureId` and `inputHash` before an improvement claim is allowed. | 01, 02 | Comparison fails with `fixture_identity_mismatch` when identity differs. |
| HIL-REQ-02 | Same input document/plan/evidence fixture can be scored by artifact completeness and validity. | 02 | Fixture corpus produces deterministic artifact hashes, schema validity, and scorer metrics. |
| HIL-REQ-03 | Candidate-only runs can fail promotion on metric threshold failure even when exit code is 0. | 01 | Contract test covers metric threshold failure and `failureClass: metric_threshold`. |
| HIL-REQ-04 | Stable/candidate runs can fail promotion on metric regression. | 01 | Contract test covers `metric_regression` comparison. |
| HIL-REQ-05 | Lab runs do not mutate real account-root profiles. | 03 | Pre/post account-root fingerprint guard fails on writes outside run root. |
| HIL-REQ-06 | SWE-bench tasks can be adapted into Moonshot harness runs without replacing H0 authority. | 04 | Adapter emits Moonshot task package, patch artifact, SWE-bench verifier result, and imported metric. |
| HIL-REQ-06a | Fake SWE-bench-like fixtures are adapter contract evidence only and do not satisfy real SWE-bench readiness by themselves. | 04 | Dependency decision records real execution selected, explicitly deferred, or user-approved skip. |
| HIL-REQ-07 | Operators can run improvement experiments, compare results, and roll back. | 05 | Operating guide defines baseline freeze, candidate run, promotion, rollback, and retention policy. |

## Invalidation Matrix

| Change | Invalidates |
|---|---|
| Metric definition changes | prior quantitative comparisons and promotion thresholds |
| Fixture corpus changes | prior artifact scorer baselines |
| Scorer implementation changes | score history unless scorer version is recorded |
| Account-root guard path list changes | previous isolation claims |
| SWE-bench adapter dependency/version changes | external verifier comparability |
| Package payload allowlist changes | package dry-run, package layout, profile parity assumptions |

## Scenario-Specific Validation Gates

Phase 01:

- `node --test tests/harness-lab-contract.test.mjs`
- `npm run test:eval`
- `npm run test:lab`

Phase 02:

- targeted scorer tests introduced by the phase
- `node --test tests/harness-lab-contract.test.mjs`
- `npm run test:lab`

Phase 03:

- targeted account-root guard tests introduced by the phase
- temp-home smoke test proving writes stay under lab run root
- `npm run test:lab`

Phase 04:

- adapter unit tests with a tiny pinned fake SWE-bench task
- external SWE-bench verifier run only when dependency policy is selected and documented
- adapter result imported into `lab-result.json.quantitative`

Phase 05:

- docs/tests proving operating guide and promotion policy are present
- at least one baseline/candidate lab evidence reference from Phases 01-03

## Completion Rule

This plan package is complete when all five phase docs exist, surface classifications are recorded, live account-root mutation remains explicitly blocked unless separately approved, and the plan closure checks pass. Execution closeout is separate: it requires phase-local scorecard, QA, handoff, and lab evidence for every executed phase.

## Review Status Semantics

Review findings use these states:

- `accepted_plan_correction`: the review finding was accepted and the parent session must update the plan.
- `resolved_by_plan_update`: the plan now contains a concrete contract or acceptance criterion for the finding.
- `phase_gated_pending_implementation`: the plan is concrete, but implementation and evidence remain future phase work.
- `blocked`: execution cannot proceed until the named dependency or decision exists.
- `phase_gated_real_execution_deferred`: fake adapter evidence exists, but real external execution is deferred.

No review item may be marked simply `resolved` when the remaining work is implementation, external dependency selection, or live adoption evidence.
