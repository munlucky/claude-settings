# Harness Product Readiness Kernel - Master Plan v1

작성 기준일: 2026-06-30

## Scope Status

Status: source-complete-lab-closeout-passed

This package turns the 2026-06-24 research result into an execution-preparation plan for product-level harness improvement. It does not replace the existing Docker baseline/candidate lab lifecycle. It layers a product readiness doctor and a common run kernel over the current external H0 lab authority.

```yaml
planPackage:
  schemaVersion: 1
  status: source_complete_lab_closeout_passed
  planRoot: docs/implementation/harness-product-readiness-kernel-2026-06-30
  selectedMasterPlan: docs/implementation/harness-product-readiness-kernel-2026-06-30/00-master-plan-v1.md
  selectedPhaseDocs:
    - docs/implementation/harness-product-readiness-kernel-2026-06-30/01-product-readiness-doctor-v1.md
    - docs/implementation/harness-product-readiness-kernel-2026-06-30/02-run-spec-and-event-ledger-v1.md
    - docs/implementation/harness-product-readiness-kernel-2026-06-30/03-promotion-authority-and-operator-flow-v1.md
    - docs/implementation/harness-product-readiness-kernel-2026-06-30/04-research-fixture-suite-v1.md
    - docs/implementation/harness-product-readiness-kernel-2026-06-30/05-lifecycle-commands-v1.md
  reviewArtifacts:
    - docs/implementation/harness-product-readiness-kernel-2026-06-30/planning-loop/plan-quality-review-iter-01.yaml
    - docs/implementation/harness-product-readiness-kernel-2026-06-30/planning-loop/plan-quality-review-iter-02.yaml
    - docs/implementation/harness-product-readiness-kernel-2026-06-30/planning-loop/blocker-confirmation-iter-03.yaml
  graphReadiness: markdown_only_not_dag_validated
  executionAuthority: "Source implementation is present and fresh Docker lab calibration/closeout must be read from the generated lab receipt after final source edits. The superseded containerized harness source draft was moved into its plan package so package-layout gates can treat it as source-local planning material."
```

## Objective

Prepare a source-first implementation path for three product surfaces:

```text
Doctor Surface
  exposes source/profile/lab/eval/research readiness as structured JSON
  never claims improvement by itself

External Runner Surface
  keeps harness-lab as the H0 promotion authority
  preserves stable/baseline -> candidate comparison as the improvement proof path

Run Kernel
  adds immutable run-spec.json and append-only events.jsonl to lab/research runs
  enables status/resume/cancel/evaluate/evolve only after the event ledger contract exists
```

## Source Inputs

| Input | Role | Status |
| --- | --- | --- |
| `.moonshot-relay/docs/research/2026-06-24-harness-product-surfaces-doctor-runner-lifecycle/analysis.md` | Research synthesis for LazyCodex doctor, Gajae-Code external runner, Ouroboros run kernel | primary planning input |
| `scripts/doctor.mjs` | Current doctor implementation | active target; currently runtime surface plus skills lock only |
| `tests/skills-doctor-contract.test.mjs` | Current doctor contract tests | active target |
| `tools/harness-lab/harness-loop.mjs` | Current baseline/candidate loop wrapper | active target for run-spec/events integration |
| `tools/harness-lab/harness-lab.mjs` | H0 lab authority and compare/promote/rollback implementation | active target only where contract extensions are needed |
| `tests/harness-lab-contract.test.mjs` | Current lab contract tests | active target |
| `docs/public/guidelines/harness-bootstrap-lab.md` | Operational procedure for lab authority and operator flow | policy source |
| `scripts/lib/event-ledger.mjs` and `tests/event-ledger-contract.test.mjs` | Existing hash-chained JSONL event helper | reuse candidate for common run ledger |
| `package.json` | Source of concrete test and lab commands | policy source |
| `AGENTS.md`, `docs/public/repository-layout.md`, `docs/public/reference/runtime-skill-surface.md` | Source/runtime/profile/package boundaries and adoption closeout gates | policy source |

## Non-Negotiables

- `doctor` is readiness reporting, not promotion or improvement authority.
- `npm run test:lab` is candidate-only smoke; it can block bad candidates but cannot prove improvement.
- Improvement claims require the H0 external lab compare path against a stored baseline or stable result with matching fixture identity.
- Candidate `verify.json`, scorer output, runtime projections, chat output, and generated reports remain evidence inputs only.
- `run-spec.json` is immutable after run start. A changed spec creates a new run.
- `events.jsonl` is append-only and hash-chained before lifecycle commands depend on it.
- Live `.moonshot-relay`, `.codex`, or `.claude` account-root mutation is out of scope until a later controlled adoption phase.
- Generated lab/research state remains outside package payloads; selected generated artifacts may be local authority evidence while a candidate or baseline is active.

## Surface Classification

| Surface | Classification | In Scope | Policy Source Paths | Required Evidence Slots |
| --- | --- | --- | --- | --- |
| `scripts/doctor.mjs`, `scripts/lib/**doctor**` if introduced | `source_only` | yes | `AGENTS.md`, `package.json`, `docs/public/reference/runtime-skill-surface.md` | doctor JSON contract tests, missing/stale/degraded fixture tests, source doctor run |
| `tests/skills-doctor-contract.test.mjs` | `source_only` | yes | `package.json` | targeted Node test |
| `tools/harness-lab/**` | `source_only` | yes | `docs/public/guidelines/harness-bootstrap-lab.md`, `package.json` | harness-lab contract tests, candidate lab run, promotion/closeout evidence when source changes are promotable |
| `scripts/lib/event-ledger.mjs` or new common run-kernel helpers | `source_only` | yes | `tests/event-ledger-contract.test.mjs`, `docs/public/guidelines/resumable-session-layer.md` | hash-chain, tamper, replay, terminal event tests |
| Research fixture scorer under `tools/evals/**` plus pinned `tests/fixtures/**` | `source_only` | yes | research package analysis, `docs/public/guidelines/harness-bootstrap-lab.md` | fixed fixture output, primary-source ratio, claim-ledger coverage, boundary reporting |
| `docs/public/guidelines/harness-bootstrap-lab.md` | `source_only` | yes | `docs/public/repository-layout.md` | semantic keyword/contract test, operator command examples |
| `.moonshot-relay/harness-lab/**` and `.moonshot-relay/docs/research/**` generated outputs | `data_or_state_migration` | read/write as generated evidence only | `docs/public/repository-layout.md`, `docs/public/guidelines/harness-bootstrap-lab.md` | retention pointer, artifact hash, cleanup exclusion when active |
| Installed account-root `.moonshot-relay`, `.codex`, `.claude` | `installed_profile_or_account_root` | read-only inspection only; live mutation out of scope | `AGENTS.md`, `docs/public/reference/runtime-skill-surface.md` | explicit installed doctor only in future adoption phase |
| Docker backend and local containers | `external_deployment_or_service` for runtime dependency; local source config only | use existing lab commands only | `docs/public/guidelines/harness-bootstrap-lab.md` | local image identity, no-publish assertion, strict container policy |

## Phase Index

| Phase | Title | Plan File | Depends On | Execution Readiness |
| --- | --- | --- | --- | --- |
| 01 | Product Readiness Doctor | `01-product-readiness-doctor-v1.md` | - | source-first ready |
| 02 | Run Spec and Event Ledger | `02-run-spec-and-event-ledger-v1.md` | - | source-first ready |
| 03 | Promotion Authority and Operator Flow | `03-promotion-authority-and-operator-flow-v1.md` | 01, 02 for new status fields | source-first ready after 01 and 02 |
| 04 | Research Fixture Suite | `04-research-fixture-suite-v1.md` | 02, partial 03 | implemented; final lab pending |
| 05 | Lifecycle Commands | `05-lifecycle-commands-v1.md` | 02, 03 | implemented; final lab pending |

## Acceptance Matrix

| ID | Phase | Criterion | Evidence Path |
| --- | --- | --- | --- |
| HPRK-001 | 01 | `doctor check --json` exposes `runtimeSurface`, `skillsLock`, `labReadiness`, `evalReadiness`, `researchReadiness`, `profileTrust`, and `generatedStateBoundary` with documented status vocabulary. | `execution/phase-01/doctor-contract-test.log` |
| HPRK-002 | 01 | Doctor marks missing last lab/eval/research evidence as `not_available` or `degraded`, not as `pass`, and returns blocking exit code only for blocking findings. | `execution/phase-01/doctor-degraded-fixtures.log` |
| HPRK-003 | 02 | Each lab run writes immutable `run-spec.json` before execution and refuses in-place mutation after `run_started`. | `execution/phase-02/run-spec-immutability-test.log` |
| HPRK-004 | 02 | Each lab run writes hash-chained `events.jsonl` with required lifecycle events and tamper detection. | `execution/phase-02/events-ledger-test.log` |
| HPRK-005 | 03 | Candidate-only output remains `smoke_only`; improvement claims require baseline/stable compare with complete fixture identity. | `execution/phase-03/promotion-authority-negative-tests.log` |
| HPRK-006 | 03 | Operator flow documents `lab:status -> edit -> lab:candidate -> lab:candidate:promote:no-regression|strict -> lab:closeout` and closeout consumption rules. | `execution/phase-03/operator-flow-audit.txt` |
| HPRK-007 | 04 | Fixed research fixture suite rejects adjacent-repo contamination by thresholding primary-source ratio, claim coverage, evidence count, and boundary reporting. | `execution/phase-04/research-fixture-score.json` |
| HPRK-008 | 05 | `status/resume/cancel/evaluate/evolve` contracts read spec/events and do not mutate prior run specs. | `execution/phase-05/lifecycle-command-contract-tests.log` |
| HPRK-009 | all | Source gates pass for each executed source phase. | `execution/phase-XX/source-gates.log` |
| HPRK-010 | adoption only | Live profile/account-root adoption is not claimed unless Operational Adoption Closeout gates pass. | `execution/adoption/operational-adoption-closeout.json` |

## Reliable Gate Set

Use only policy-sourced commands as required gates:

```powershell
node scripts/doctor.mjs check --json
node scripts/skills-audit.mjs audit --lock skills.lock.json --runtime-surface package/runtime-surface.json --json
npm run test:lab
npm run test:package
npm run test:eval
npm test
npm run lab:candidate
npm run lab:candidate:promote:no-regression
npm run lab:candidate:promote:strict
npm run lab:closeout
```

Targeted direct `node --test tests/<name>.mjs` commands in phase docs are supporting checks. They are not package-level required gates unless `package.json` adds a matching npm script or the phase records them as phase-local diagnostics.

`lab:candidate:promote:no-regression` is the product safety gate. `lab:candidate:promote:strict` is meaningful only after a new metric or fixture makes positive improvement measurable.

Live adoption gates are explicitly out of the implementation phases in this package. If a later phase chooses live adoption, add:

```powershell
node package/build-package.mjs --runtime all --dry-run --json
node bin/moonshot-relay.mjs install --runtime all --json
node scripts/doctor.mjs check --repo-root <installed-root> --lock <installed-lock> --runtime-surface <installed-runtime-surface> --json
```

## Review Status

Independent review is required because this package affects harness execution authority, generated state evidence, and potential installed-profile readiness reporting. Initial sidecar review findings are recorded in `planning-loop/plan-quality-review-iter-01.yaml`; follow-up review findings and accepted fixes are recorded in `planning-loop/plan-quality-review-iter-02.yaml`. Blocker confirmation found no remaining blockers and is recorded in `planning-loop/blocker-confirmation-iter-03.yaml`.

## Completion Rule

This plan package is complete when all five phase docs and planning-loop review artifacts exist, every phase declares owned/read-only paths, write-set boundaries, surface classification, acceptance evidence, and policy-sourced gates, and closure checks verify expected files plus objective keywords.
