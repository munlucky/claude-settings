# SCORECARD

> Available preset profiles:
> - `generic`: balanced default
> - `saas`: product/user-flow heavy
> - `api-backend`: contract and verification heavy
> - `frontend`: user-flow and UI-state heavy
> - `demo_first`: clickable/mock demo approval before Real Functional
> - `platform`: verification and handoff heavy
>
> Dynamic weighting rule:
> - keep `CONFORM`, `VER`, and `CLOSE` at the preset baseline
> - rebalance only the combined `REQ + SCN` budget
> - for `frontend`, keep `CONFORM`, `VIS`, `A11Y`, `PERF`, `VER`, and `CLOSE` at the preset baseline
> - for `frontend`, rebalance only the combined `REQ + SCN` budget
> - if detected `REQ-*` count is much higher, move up to 10 points toward `REQ`
> - if detected `SCN-*` count is much higher, move up to 10 points toward `SCN`
> - keep the combined score target at 100

## Objective Checklist
| ID | Category | Weight | Status | Evidence | Notes |
|----|----------|--------|--------|----------|-------|
| OBJ-CONFORM | Source phase plan conformance verified | 20 | pending/pass/fail |  | Source snapshot, exact targets, and approved deviations |
| OBJ-REQ | In-scope requirements covered | 25 | pending/pass/fail |  |  |
| OBJ-SCN | Critical scenarios evidenced | 25 | pending/pass/fail |  |  |
| OBJ-VER | Required verification commands passed | 20 | pending/pass/fail |  |  |
| OBJ-CLOSE | Review, finish closeout, and workflow-surface consistency recorded | 10 | pending/pass/fail |  |  |
| OBJ-MIN | Minimal-correct implementation ladder checked; lower-rung reuse/skip/new-surface decision recorded | 5 | pending/pass/fail |  | `docs/public/guidelines/minimal-correct-implementation.md` |
| OBJ-SPEC-TEST | Spec-Test Obligations covered | 10 | pending/pass/fail |  | `spec_test_obligation_result_missing`, `spec_test_obligation_missing`, `tdd_red_evidence_missing`, `tdd_green_evidence_missing`, `required_spec_test_not_run`, `critical_scenario_smoke_only`, and `duplicate_spec_test_obligation` must be zero |

## Frontend Preset Objectives

Use when the phase, contract, or detected scope is frontend/UI work.

| ID | Category | Weight | Status | Evidence | Notes |
|----|----------|--------|--------|----------|-------|
| OBJ-CONFORM | Source UI phase plan conformance verified | 10 | pending/pass/fail |  | Source requirements and approved deviations reconciled |
| OBJ-REQ | In-scope UI requirements covered | 15 | pending/pass/fail |  | In-scope `REQ-*` implemented and verified |
| OBJ-SCN | Critical user scenarios evidenced | 20 | pending/pass/fail |  | Critical `SCN-*` has fresh browser/E2E or generated-artifact evidence |
| OBJ-VIS | Required visual evidence passed | 15 | pending/pass/fail |  | Required screenshots, visual checks, or visual diff evidence pass; required setup_gap or over-threshold diff is blocking |
| OBJ-A11Y | Required accessibility evidence passed | 15 | pending/pass/fail |  | Required axe, keyboard, focus, or equivalent accessibility evidence passes; missing required setup is blocking |
| OBJ-PERF | Required performance evidence passed | 10 | pending/pass/fail |  | Required performance budget or runtime measurement evidence passes; missing required setup is blocking |
| OBJ-VER | Required verification commands passed | 10 | pending/pass/fail |  | Contract required checks passed with fresh evidence |
| OBJ-CLOSE | Review and closeout recorded | 5 | pending/pass/fail |  | QA, handoff, review disposition, and finish readiness are current |
| OBJ-MIN | Minimality decision recorded | 5 | pending/pass/fail |  | Existing surface reuse, new surface reason, or skipped lower-rung options are explicit |

Frontend evidence rule:
- `OBJ-VIS`, `OBJ-A11Y`, and `OBJ-PERF` are required only when declared by the sprint contract, source phase plan, scenario matrix, verification contract, or critical scenario policy.
- A setup gap is blocking only when it prevents required frontend evidence from being produced.
- Required visual diff evidence must cite the visual diff verdict JSON. `passed` counts as pass; `failed` and required `setup_gap` count as fail until remediated or explicitly replanned.
- Critical frontend `SCN-*` rows cannot use smoke-only evidence to justify a clean finish when visual, accessibility, or performance evidence is required.
- Keep `uat_ready` and `uat_complete` separate; automation can support `uat_ready`, but does not imply human `uat_complete`.

## Demo-first MVP Objectives

Use when `mvpMethodology.profile: demo_first`.

| ID | Category | Status | Evidence | Notes |
|----|----------|--------|----------|-------|
| OBJ-DEMO-FLOW | Clickable demo routes, primary CTA, and core flow are evidenced | pending/pass/fail |  | Required for demo approval |
| OBJ-DEMO-STATE | Required loading, empty, error, and success states are evidenced | pending/pass/fail |  | Required before demo approval |
| OBJ-MOCK | Mock success and error paths are evidenced | pending/pass/fail |  | Required for Mock Functional Demo |
| OBJ-CONTRACT | Mock API contract and real API response shape remain compatible | pending/pass/fail |  | Required for Real Functional |
| OBJ-USER-APPROVAL | User demo approval has approved non-empty scope | pending/pass/fail | docs/implementation/USER_DEMO_APPROVAL.md | Hard stop before Real Functional |
| OBJ-REAL | Real API/persistence evidence replaces mock-only behavior | pending/pass/fail |  | Required for Real Functional |

## Workflow Surface Consistency

Use this section for harness, workflow, skill, or documentation changes.

| Check | Status | Evidence |
|-------|--------|----------|
| Public entrypoints remain limited to the approved workflow surface | pending/pass/fail |  |
| Deprecated skills are not presented as default stage owners | pending/pass/fail |  |
| Bundle references point to existing assets or documented aliases | pending/pass/fail |  |
| Stage map still covers Intake, Plan, Ready / Isolate, Execute, Review, Verify, Finish / Handoff | pending/pass/fail |  |

## Spec-Test Obligation Score

| Check | Status | Evidence |
|-------|--------|----------|
| `specTestObligations` row exists for every `REQ-*`, `SCN-*`, and UAT-critical item | pending/pass/fail |  |
| `verificationMode` is valid for every row: `tdd_red_green`, `characterization_first`, `evidence_mandatory`, or `not_applicable` | pending/pass/fail |  |
| `interface`, `depth`, and `environment` are populated independently | pending/pass/fail |  |
| TDD rows include `redCommand`, `redEvidencePath`, `greenCommand`, and `greenEvidencePath` | pending/pass/fail |  |
| Exception rows include `requiredCommand`, `evidencePath`, and `bypassReason` | pending/pass/fail |  |
| Critical scenario rows are not smoke-only when deeper evidence is required | pending/pass/fail |  |

## Score Summary
- Current score: 0
- Target score: 100
- Unmet checklist items: 5
- Blocking defects: 0
- Verdict: retry

## Task-Level Status Adapter
- Status: FULL | PARTIAL | NO
- Current task status: NO
- Partial threshold: 60

| Status | Rule |
|--------|------|
| FULL | Target score met, unmet checklist items = 0, blocking defects = 0, and required verification evidence exists |
| PARTIAL | Core build/verification is preserved, but some REQ/SCN/UAT coverage remains incomplete |
| NO | Blocking defect, verification hard gate failure, critical regression, or score below partial threshold |

Mapping note:
- This borrows SWE-bench's fail-to-pass / pass-to-pass completion vocabulary conceptually.
- It does not import SWE-bench runtime code.
- Completion gate requires `Current task status: FULL`; `PARTIAL` and `NO` block clean finish.

## Loop Policy
- `done` requires Current score >= Target score
- `done` requires OBJ-CONFORM = pass
- `done` requires demo-first MVP objectives to be pass when profile is `demo_first`
- `done` requires Unmet checklist items = 0
- `done` requires Blocking defects = 0
- `blocked` means environment, contract, or dependency prevents progress
- `retry` means continue the active phase only
