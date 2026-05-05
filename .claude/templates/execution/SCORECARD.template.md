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
