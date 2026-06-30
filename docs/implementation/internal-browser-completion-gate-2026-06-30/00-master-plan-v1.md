# Internal Browser Completion Gate - Master Plan v1

Written: 2026-06-30

## Scope Status

Status: reviewed_source_plan_ready_for_phase_01

This package prepares the next harness improvement: an internal completion gate that prevents an AI coding agent from declaring done until browser and integration evidence exists. It deliberately excludes operational schedulers, nightly regression, production synthetic checks, alerting, and external service monitoring.

```yaml
planPackage:
  schemaVersion: 1
  status: reviewed_source_plan_ready_for_phase_01
  planRoot: docs/implementation/internal-browser-completion-gate-2026-06-30
  selectedMasterPlan: docs/implementation/internal-browser-completion-gate-2026-06-30/00-master-plan-v1.md
  selectedPhaseDocs:
    - docs/implementation/internal-browser-completion-gate-2026-06-30/01-authority-and-result-contract-v1.md
    - docs/implementation/internal-browser-completion-gate-2026-06-30/02-preview-fixture-runner-v1.md
    - docs/implementation/internal-browser-completion-gate-2026-06-30/03-playwright-artifact-normalization-v1.md
    - docs/implementation/internal-browser-completion-gate-2026-06-30/04-agentic-browser-confirmation-v1.md
    - docs/implementation/internal-browser-completion-gate-2026-06-30/05-repair-loop-and-done-gate-v1.md
    - docs/implementation/internal-browser-completion-gate-2026-06-30/06-closeout-validation-and-lab-promotion-v1.md
  reviewArtifacts:
    - docs/implementation/internal-browser-completion-gate-2026-06-30/planning-loop/plan-quality-review-iter-01.yaml
    - docs/implementation/internal-browser-completion-gate-2026-06-30/planning-loop/plan-quality-review-iter-02.yaml
  graphReadiness: markdown_only_not_dag_validated
  executionAuthority: "This is a source-local plan package. It does not mutate runtime profiles, package payloads, live account roots, generated lab baselines, or browser artifacts."
```

## Objective

Make agent completion evidence stronger than static tests:

```text
code change
  -> static/package/build checks
  -> preview runtime and fixture setup
  -> deterministic Playwright smoke/integration verification
  -> agentic browser confirmation
  -> structured result and failure artifacts
  -> bounded repair loop
  -> verification-plane evidence
  -> runtime-state completion assessment
```

The rule this plan implements is:

```text
If browser or integration evidence is required, static tests alone cannot justify done.
```

## Explicit Exclusions

- No operational integration-test scheduler.
- No nightly regression scheduler.
- No production synthetic monitoring.
- No Argo, BullMQ, Temporal, PagerDuty, Slack, Jira, or uptime workflow.
- No live profile, account-root, deployment, or production mutation.
- No automatic baseline rerun when `calibration_required` appears.
- No Codex CLI/auth smoke inside the candidate benchmark path.
- No Stagehand, AgentQL, Browser Use, or Skyvern as MVP authority.
- No automatic weakening, skipping, or deletion of failing tests.

## Source Inputs

| Input | Role |
| --- | --- |
| User attachment: scheduler-excluded browser completion strategy | Primary product intent |
| `package.json` | Concrete npm script authority |
| `AGENTS.md` | canonical source and runtime profile boundary |
| `schemas/verification.contract.yaml` | completion authority planes and browser backend policy |
| `docs/public/runtime-control-plane.md` | runtime-state authority and browser trace evidence contract |
| `docs/public/guidelines/verification-contract.md` | verification profile versus completion authority rule |
| `docs/public/guidelines/verification-workflow-evidence.md` | workflow evidence and closeout provenance policy |
| `docs/public/guidelines/harness-bootstrap-lab.md` | H0 lab authority and lab operator flow |
| `scripts/browser-flow-runner.mjs` | existing browser flow verdict runner |
| `scripts/verification-plane.mjs` and `scripts/lib/verification-plane.mjs` | existing evidence writers |
| `agents/verification/verify-runtime.sh` | existing runtime/browser verifier shell surface |
| `docs/implementation/harness-product-readiness-kernel-2026-06-30/00-master-plan-v1.md` | closest prior product readiness package |
| `docs/implementation/harness-lab-lifecycle-closeout-hardening-2026-06-25/00-master-plan-v1.md` | closeout freshness and commit-consumable receipt policy |

## Current Truth Notes

- `package.json` currently has `lab:*`, `test:*`, and H0 lab scripts, but no `harness:verify` npm script.
- Browser-related source already exists through `scripts/browser-flow-runner.mjs`, `scripts/verification-plane.mjs normalize-browser-trace`, and `agents/verification/verify-runtime.sh`.
- Generated lab baseline ids are not stable planning facts. The user intake mentioned `baseline-0018`; current local generated state observed during planning was newer. Execution must read the live baseline through `npm run lab:status`.
- `npm run lab:auth-smoke` is a separate Codex CLI/auth capability smoke. It is not an improvement scoring path.
- `lab:candidate` and `npm run test:lab` can block bad candidates, but improvement claims require promotion-grade compare evidence.

## Non-Negotiables

- Runtime-state completion authority is preserved. Browser artifacts and `result.json` are evidence inputs, not whole-plan authority.
- H0 harness-lab promotion authority is preserved for Moonshot Relay harness changes.
- Deterministic Playwright assertions are the pass/fail source for UI and integration flows. Agentic browser checks are final confirmation evidence, not assertion replacement.
- Generated browser artifacts remain under excluded runtime artifact roots such as `.moonshot-relay/browser-artifacts/**`.
- Failure artifacts must be structured enough for repair without weakening the expected behavior.
- Any self-healing probe can suggest locators, accessibility labels, or test ids, but cannot change expected behavior or silently update baselines.
- Every phase that affects completion authority or evidence authority requires independent review before source implementation closeout.

## Task Classification Contract

Phase 01 must make the completion gate fail closed for browser-relevant work:

```yaml
taskVerificationClass:
  requiresBrowserEvidence: true | false
  requiresIntegrationEvidence: true | false
  criticalScenario: true | false
  waiver:
    allowed: false
    reason: ""
    approvedBy: ""
  failClosedDefaults:
    ui_or_frontend_change:
      requiresBrowserEvidence: true
      criticalScenario: true
    route_or_api_integration_change:
      requiresIntegrationEvidence: true
      criticalScenario: true
    docs_only:
      requiresBrowserEvidence: false
      requiresIntegrationEvidence: false
```

Unknown task class is not treated as browser-clean. It is `needs_classification` until a source contract, sprint contract, or explicit waiver records the required evidence plane. A waiver must record why browser or integration evidence is not applicable and must not change whole-plan completion authority.

## Result And Outcome Contract

Phase 01 should reserve the generated result path:

```text
.moonshot-relay/browser-artifacts/<runId>/<scenarioId>/browser-completion-result.v1.json
```

Required fields include the Phase 01 fields plus `authoritySource: "evidence_only"`, `artifactSha256`, `generatedAt`, `producerCommand`, `staleStatus`, `runtimeDecisionRef`, and a redaction manifest. Playwright outcomes use:

```text
clean_pass
flaky_pass
failed
setup_gap
```

`flaky_pass` is not clean finish evidence for a critical scenario. Critical scenarios require a fresh `clean_pass` or an explicit human-reviewed blocker.

## Browser Adapter Policy

The final confirmation adapter is Agent Browser CLI or Playwright MCP. The existing `browserctl`/`browser-flow-runner` path may be used only as a legacy or local compatibility fallback when the phase records that fallback explicitly. A fallback verdict is evidence, not authority, and cannot override failed Playwright assertions.

## Surface Classification

| Surface | Classification | In Scope | Policy Source Paths | Required Evidence Slots |
| --- | --- | --- | --- | --- |
| Plan docs `00-master-plan-v1.md`, `01-*.md` through `06-*.md`, and `planning-loop/plan-quality-review-iter-*.yaml` | `source_only` | yes | `AGENTS.md`, `docs/public/repository-layout.md` | closure checks, independent review artifacts |
| `docs/implementation/internal-browser-completion-gate-2026-06-30/execution/**`, `close/**`, `archive/**` | `data_or_state_migration` | generated evidence only | `docs/public/repository-layout.md` | phase-local scorecards, QA, handoffs, receipts; never package payload |
| `schemas/verification.contract.yaml` | `source_only` | planned implementation | `schemas/verification.contract.yaml`, `docs/public/guidelines/verification-contract.md` | contract tests for browser/integration-required completion |
| `scripts/verification-plane.mjs`, `scripts/lib/verification-plane.mjs` | `source_only` | planned implementation | `docs/public/runtime-control-plane.md`, `docs/public/guidelines/verification-workflow-evidence.md` | normalized browser/integration evidence tests |
| `scripts/browser-flow-runner.mjs`, `agents/verification/verify-runtime.sh` | `source_only` | planned implementation | `tests/workflow-e2e-contract.test.mjs`, `docs/public/runtime-control-plane.md` | flow verdict, setup-gap, artifact path tests |
| `scripts/lib/review-bundle.mjs`, `schemas/review-*.schema.json`, `tests/review-*-contract.test.mjs` | `source_only` | planned implementation | `docs/public/runtime-control-plane.md`, `skills/codex-review-code/SKILL.md` | review critique loop receipt, redaction, finding disposition, runtime/eval evidence tests |
| future Playwright runner or scenario specs under `tools/**`, `scripts/**`, `tests/fixtures/**` | `source_only` | planned implementation | `AGENTS.md`, `docs/public/repository-layout.md` | deterministic fixture tests, artifact schema tests |
| `skills/browser-verifier/**`, `skills/qa-flow/**`, `skills/completion-verifier/**` | `source_only` | possible implementation | `docs/public/guidelines/verification-workflow-evidence.md` | skill contract tests and package dry-run |
| `package.json` scripts | `source_only` | possible implementation only if script surface is added | `package.json`, `docs/public/guidelines/harness-bootstrap-lab.md` | npm script contract, README/operator docs |
| `Dockerfile.harness-lab` | `source_only` | only if H0 Docker source changes | `docs/public/guidelines/harness-bootstrap-lab.md` | container policy test, image identity evidence |
| `.moonshot-relay/browser-artifacts/**`, `.moonshot-relay/runtime-verdict-*`, `.moonshot-relay/browser-flow-verdict-*` | `data_or_state_migration` | generated evidence only | `docs/public/repository-layout.md`, `schemas/verification.contract.yaml` | artifact path, trace metadata, cleanup exclusion |
| `.moonshot-relay/harness-lab/**` | `data_or_state_migration` | read/write only through existing lab commands | `docs/public/guidelines/harness-bootstrap-lab.md` | candidate summary, compare report, closeout receipt |
| account roots `%USERPROFILE%/.moonshot-relay`, `%USERPROFILE%/.codex`, `%USERPROFILE%/.claude` | `installed_profile_or_account_root` | read-only; no live mutation | `AGENTS.md`, `docs/public/reference/runtime-skill-surface.md` | explicit adoption closeout if later selected |
| Docker daemon and benchmark image runtime | `external_deployment_or_service` | existing lab runtime dependency only | `docs/public/guidelines/harness-bootstrap-lab.md` | image identity, no auth mount, no publish |

## Phase Index

| Phase | Title | Plan File | Depends On | Execution Readiness |
| --- | --- | --- | --- | --- |
| 01 | Authority and Result Contract | `01-authority-and-result-contract-v1.md` | - | ready after package review |
| 02 | Preview and Fixture Runner | `02-preview-fixture-runner-v1.md` | 01 | ready after 01 |
| 03 | Playwright Artifact Normalization | `03-playwright-artifact-normalization-v1.md` | 01, 02 | ready after 02 |
| 04 | Agentic Browser Confirmation | `04-agentic-browser-confirmation-v1.md` | 01, 03 | ready after 03 |
| 05 | Repair Loop and Done Gate | `05-repair-loop-and-done-gate-v1.md` | 01-04 | ready after 04 |
| 06 | Closeout Validation and Lab Promotion | `06-closeout-validation-and-lab-promotion-v1.md` | 01-05 | final validation phase |

## Acceptance Matrix

The `execution/**` paths below are generated, untracked runtime scratch evidence. They are not required plan-package closure files and must not be treated as package payload.

| ID | Phase | Criterion | Evidence Path |
| --- | --- | --- | --- |
| IBCG-001 | 01 | A machine-readable result contract distinguishes static, preview, fixture, Playwright, browser confirmation, artifact, and runtime-environment failures. | `execution/phase-01/result-contract-test.log` |
| IBCG-002 | 01 | `result.json` and browser verdict artifacts are evidence inputs, not runtime-state completion authority. | `execution/phase-01/completion-authority-negative-test.log` |
| IBCG-003 | 02 | Preview runtime startup, readiness probe, fixture seed/mock setup, timeout, log capture, and cleanup are explicitly modeled. | `execution/phase-02/preview-runner-contract-test.log` |
| IBCG-004 | 03 | Playwright smoke and integration flows write screenshot, trace, video when enabled, console, network, stdout/stderr, and normalized JSON evidence. | `execution/phase-03/playwright-artifact-contract-test.log` |
| IBCG-005 | 04 | Agentic browser confirmation verifies URL, accessible page structure, expected UI affordances, and screenshot evidence without replacing Playwright assertions. | `execution/phase-04/browser-confirmation-contract-test.log` |
| IBCG-006 | 05 | Repair loop is bounded, preserves failing assertions, writes repair prompt, invalidates stale evidence after source changes, and reruns the same scenario. | `execution/phase-05/repair-loop-negative-tests.log` |
| IBCG-007 | 05 | Agent done/clean finish is blocked when required browser or integration evidence is missing, stale, setup-gap, smoke-only for a critical scenario, or missing the required review-critique-loop receipt. | `execution/phase-05/done-gate-contract-test.log`, `execution/phase-05/review-critique-loop-receipt.json` |
| IBCG-008 | 06 | Source gates, H0 lab lifecycle closeout, and runtime-state accepted completion pass for the implemented source changes. | `execution/phase-06/lab-closeout.json`, `execution/phase-06/runtime-completion-decision.json` |

## Gate Source Table

| Command | Required For Phase | Policy Source Path | Policy Reason | Evidence Slot | Missing Policy Status |
| --- | --- | --- | --- | --- | --- |
| `npm test` | all implementation phases | `package.json` | active full source contract suite | `execution/phase-XX/npm-test.log` | sourced |
| `npm run test:package` | 06 | `package.json` | package boundary suite | `execution/phase-06/test-package.log` | sourced |
| `npm run test:eval` | 06 | `package.json`, `docs/public/runtime-control-plane.md` | golden eval gate | `execution/phase-06/test-eval.log` | sourced |
| `npm run test:lab` | 06 diagnostics | `package.json`, `docs/public/guidelines/harness-bootstrap-lab.md` | candidate-only H0 smoke | `execution/phase-06/test-lab.log` | sourced |
| `npm run lab:status` | 06 | `package.json`, `docs/public/guidelines/harness-bootstrap-lab.md` | live baseline/current loop readiness | `execution/phase-06/lab-status.json` | sourced |
| `npm run lab:candidate` | 06 | `package.json`, `docs/public/guidelines/harness-bootstrap-lab.md` | current candidate benchmark | `execution/phase-06/candidate-summary.json` | sourced |
| `npm run lab:candidate:promote:no-regression` | 06 | `package.json`, `docs/public/guidelines/harness-bootstrap-lab.md` | default product safety promotion | `execution/phase-06/promotion.json` | sourced |
| `npm run lab:closeout` | 06 | `package.json`, `docs/public/guidelines/harness-bootstrap-lab.md` | commit-consumable receipt revalidation | `execution/phase-06/lab-closeout.json` | sourced |
| `node scripts/doctor.mjs check --json` | 06 | `docs/public/reference/runtime-skill-surface.md` | readiness surface check | `execution/phase-06/doctor.json` | sourced |
| `node scripts/verification-plane.mjs normalize-browser-trace --run-id <runId> --goal-id <goalId> --url <url> --flow smoke --json` | 03, 04, 05 | `docs/public/runtime-control-plane.md`, `scripts/verification-plane.mjs` | browser trace evidence writer | `execution/phase-XX/browser-trace.json` | sourced |
| `node scripts/verification-plane.mjs record-summary --run-id <runId> --goal-id <goalId> --profile runtime_adapter --planes-json '<json>' --identity-json '<json>' --json` | 05, 06 | `docs/public/runtime-control-plane.md`, `scripts/verification-plane.mjs` | verification-plane evidence writer | `execution/phase-XX/verification-summary.json` | sourced |
| `node scripts/runtime-state.mjs assess-completion --run-id <runId> --goal-id <goalId> --json` | 05, 06 | `docs/public/runtime-control-plane.md`, `scripts/runtime-state.mjs` | whole-plan completion authority | `execution/phase-XX/runtime-completion-decision.json` | sourced |
| `node scripts/review-bundle-build.mjs --input <json> --json` | 05 | `tests/review-bundle-contract.test.mjs`, `scripts/lib/review-bundle.mjs` | fresh review input bundle with digest and redaction | `execution/phase-05/review-bundle.json` | sourced |
| `npm run lab:candidate:promote:strict` | 06 optional | `package.json`, `docs/public/guidelines/harness-bootstrap-lab.md` | strict improvement after new metric/fixture | `execution/phase-06/strict-promotion.json` | optional_until_metric_added |
| `npm run lab:auth-smoke` | 06 optional | `package.json`, `docs/public/guidelines/harness-bootstrap-lab.md` | Codex CLI/auth capability smoke only | `execution/phase-06/auth-smoke.json` | separate_from_scoring |
| `npm run harness:verify` | TBD | none yet | intake candidate command name | TBD | blocker_until_phase_01_selects_surface |
| `npm run test:e2e:smoke` | TBD | none yet | intake candidate command name | TBD | blocker_until_phase_01_selects_surface |
| `npm run harness:browser-verify` | TBD | none yet | intake candidate command name | TBD | blocker_until_phase_01_selects_surface |

Mandatory closeout gate set:

```powershell
npm test
npm run test:package
npm run test:eval
npm run test:lab
npm run lab:status
npm run lab:candidate
npm run lab:candidate:promote:no-regression
npm run lab:closeout
node scripts/doctor.mjs check --json
node scripts/verification-plane.mjs normalize-browser-trace --run-id <runId> --goal-id <goalId> --url <url> --flow smoke --json
node scripts/verification-plane.mjs record-summary --run-id <runId> --goal-id <goalId> --profile runtime_adapter --planes-json '<json>' --identity-json '<json>' --json
node scripts/runtime-state.mjs assess-completion --run-id <runId> --goal-id <goalId> --json
```

Planned command names that remain blockers until Phase 01 selects a surface:

```powershell
npm run harness:verify
npm run test:e2e:smoke
npm run harness:browser-verify
```

These names may become implementation outputs only after Phase 01 chooses the command surface and updates `package.json` plus docs/tests.

## Operator Flow For Harness Source Changes

Use the current lab loop after implementation phases:

```powershell
npm run lab:status
# edit source and tests
npm test
npm run lab:candidate
npm run lab:candidate:promote:no-regression
npm run lab:closeout
node scripts/verification-plane.mjs record-summary --run-id <runId> --goal-id <goalId> --profile runtime_adapter --planes-json '<json>' --identity-json '<json>' --json
node scripts/runtime-state.mjs assess-completion --run-id <runId> --goal-id <goalId> --json
```

`lab:closeout` proves commit workflow consumption. `assess-completion` with `status=accepted` is still required before a whole-plan clean completion claim.

`no_regression` is the product safety gate. `strict_improvement` is reserved for phases that add a measurable browser/integration metric or fixture and then improve it:

```powershell
npm run lab:candidate:promote:strict
```

If `calibration_required` appears, baseline execution must be explicit:

```powershell
node tools\harness-lab\harness-loop.mjs calibrate --backend docker --promote --json
npm run lab:closeout
```

## Independent Review And Improvement Loop

This package uses independent agents in two roles:

- Intake agents: current code/policy discovery, requirements/exclusion analysis, and authority-boundary review.
- Package reviewers: after draft creation and after parent integration, independent reviewers must inspect the concrete plan package and produce `planning-loop/plan-quality-review-iter-01.yaml` plus `planning-loop/plan-quality-review-iter-02.yaml`.

## Review-Critique-Loop Contract

Use this loop for plan packages, phase closeout, and non-trivial browser/integration completion claims:

```yaml
reviewCritiqueLoop:
  defaultReviewerCount: 3
  reviewerCountPolicy: "effectiveReviewerCount = min(requestedN ?? 3, 3) unless this plan records an explicit package-local override"
  iterations: 2
  iterationMode:
    iter01: "parallel independent critique from distinct perspectives"
    parentIntegration01: "main session revalidates findings and applies only accepted edits"
    iter02: "parallel independent critique of the updated artifact or blocker-confirmation pass"
    parentIntegration02: "main session records accepted, rejected, deferred, and blocking outcomes"
  requiredPerspectives:
    - "authority inversion and completion semantics"
    - "browser/integration false-positive path"
    - "repair-loop safety and assertion preservation"
    - "artifact schema freshness and redaction"
    - "package/runtime/generated-state boundary"
  parentIntegration:
    required: true
    parentResolutionStatus:
      - accepted_plan_correction
      - resolved_by_plan_update
      - rejected_with_evidence
      - deferred_with_blocker
      - tracked_blocker
      - backlog_non_blocking
  completionAuthority: false
```

Raw reviewer prompts, model transcripts, hidden reasoning, and chat history must not be written to runtime-state or packaged source. The source-level review loop stores compact review artifacts under `planning-loop/`. Runtime evidence stores only bounded review receipts, finding dispositions, blocker/eval outcomes, and artifact digests.

Review finding disposition and parent resolution are separate contracts. `reviewFinding.disposition` keeps the existing review schema enum: `autofix_safe`, `replan_required`, `human_decision`, or `informational`. `parentResolution.status` uses the closed enum above to record how the main session accepted, rejected, deferred, or tracked each finding after independent review.

For implementation closeout, use the existing review contract surface:

- `scripts/lib/review-bundle.mjs`
- `scripts/review-bundle-build.mjs`
- `schemas/review-bundle.schema.json`
- `schemas/review-finding.schema.json`
- closed `schemas/review-critique-loop.schema.json` for the Phase 05 iteration receipt contract
- `tests/review-bundle-contract.test.mjs`
- `tests/review-finding-contract.test.mjs`
- `skills/codex-review-code/SKILL.md`

Do not implement model orchestration, reviewer prompts, critique iteration, finding disposition, source mutation, or QA report mutation inside H0 lab. H0 may run deterministic tests that prove review receipts are required and correctly classified, but review semantics remain evidence inputs for verification/runtime-state.

The parent session owns all final file edits. Parent resolution status must be one of:

- `accepted_plan_correction`
- `resolved_by_plan_update`
- `rejected_with_evidence`
- `deferred_with_blocker`
- `tracked_blocker`
- `backlog_non_blocking`

Implementation phases must repeat the two-iteration review -> improvement loop before claiming closeout. If iteration 2 still has blocking findings, closeout status is blocked unless the finding is explicitly converted to a tracked blocker with owner, evidence path, and continuation step.

## Open Spec Gaps To Resolve In Phase 01

- Exact command surface: npm script, Moonshot CLI subcommand, skill wrapper, or bridge command.
- Exact primary final-confirmation adapter selection between Agent Browser CLI and Playwright MCP, plus explicit fallback acceptance conditions for legacy/local `browserctl`.
- Exact result schema name and path so it is not confused with H0 `lab-result.json`.
- Target-project command discovery for static/build/preview steps.
- Fixture reset and secret redaction contract.
- Setup-gap versus product-failure classification.
- Whether smoke-only browser evidence can ever satisfy non-critical tasks without an explicit non-critical classification.

## Completion Rule

This plan package is ready only when all phase docs exist, both review iteration artifacts exist, objective keyword search passes, each non-source-only surface has classification and evidence slots, and the review loop records accepted changes. Execution completion is separate and requires phase-local implementation evidence, required review-critique-loop receipts, H0 lab closeout, verification-plane evidence, and runtime-state accepted completion.
