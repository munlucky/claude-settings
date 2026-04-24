# SCORECARD

> Available preset profiles:
> - `generic`: balanced default
> - `saas`: product/user-flow heavy
> - `api-backend`: contract and verification heavy
> - `frontend`: user-flow and UI-state heavy
> - `platform`: verification and handoff heavy
>
> Dynamic weighting rule:
> - keep `VER` and `CLOSE` at the preset baseline
> - rebalance only the combined `REQ + SCN` budget
> - if detected `REQ-*` count is much higher, move up to 10 points toward `REQ`
> - if detected `SCN-*` count is much higher, move up to 10 points toward `SCN`
> - keep the combined score target at 100

## Objective Checklist
| ID | Category | Weight | Status | Evidence | Notes |
|----|----------|--------|--------|----------|-------|
| OBJ-REQ | In-scope requirements covered | 40 | pending/pass/fail |  |  |
| OBJ-SCN | Critical scenarios evidenced | 30 | pending/pass/fail |  |  |
| OBJ-VER | Required verification commands passed | 20 | pending/pass/fail |  |  |
| OBJ-CLOSE | Review, finish closeout, and workflow-surface consistency recorded | 10 | pending/pass/fail |  |  |

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
- Unmet checklist items: 4
- Blocking defects: 0
- Verdict: retry

## Loop Policy
- `done` requires Current score >= Target score
- `done` requires Unmet checklist items = 0
- `done` requires Blocking defects = 0
- `blocked` means environment, contract, or dependency prevents progress
- `retry` means continue the active phase only
