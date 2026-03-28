# Requirements Traceability Harness

> Use this guide when a downstream project must keep iterating until the documented feature set is implemented, verified, and ready for human UAT.

## Goal

Convert "did we build everything in the docs?" from a judgment call into explicit execution artifacts.

The harness closes work only when:
- every in-scope requirement is tracked
- every critical user scenario has evidence
- automated verification is fresh
- the run is marked `uat_ready`

It does not infer `uat_complete` from automation alone.

## Required Artifacts

For medium/complex `product_project` work, treat these as default execution artifacts:
- `SPRINT_CONTRACT.md`
- `QA_REPORT.md`
- `HANDOFF.md`
- `SCORECARD.md`
- `REQUIREMENTS_TRACEABILITY.md`
- `SCENARIO_MATRIX.md`
- `UAT_CHECKLIST.md`
- choose a scorecard preset that matches the work shape: `generic`, `saas`, `api-backend`, `frontend`, or `platform`
- when both traceability artifacts exist, rebalance only the combined `REQ + SCN` budget from detected `REQ-*` / `SCN-*` counts

## Identity Model

Use stable identifiers:
- `REQ-*` for documented product requirements
- `SCN-*` for user-visible scenarios or journeys
- `UAT-*` for manual acceptance steps when human validation is required

Recommended mapping:
- `PRD.md` and `SPEC.md` are the source of `REQ-*`
- `REQ-*` map to slices/tasks in the plan
- user-visible `REQ-*` map to one or more `SCN-*`
- critical `SCN-*` map to runtime/browser/E2E evidence

## Harness Flow

1. Planning
   - extract `REQ-*` from product docs
   - assign each requirement to a slice owner
   - define critical `SCN-*` before implementation begins
2. Contracting
   - record in-scope `REQ-*` and `SCN-*` in `SPRINT_CONTRACT.md`
   - state which evidence must exist before finish
3. Execution
   - implement only the current in-scope items
   - update traceability artifacts as code and tests land
4. Verification
   - run contract-defined checks
   - refresh runtime or E2E evidence for changed critical scenarios
   - update `QA_REPORT.md` with any uncovered `REQ-*` or missing `SCN-*` evidence
   - update `SCORECARD.md` with objective score, unmet checklist count, and verdict
   - keep `VER` / `CLOSE` weights stable unless project policy explicitly overrides them
5. Finish or Handoff
   - finish only when `uat_ready == true` and `SCORECARD.md` says `done`
   - use `HANDOFF.md` when any requirement or scenario remains open

## Completion Rules

`pass` is allowed only when all are true:
- every in-scope `REQ-*` is `implemented` or `verified`
- no in-scope requirement lacks a verification path
- every critical `SCN-*` has fresh runtime or E2E evidence
- required contract checks passed with fresh evidence
- `UAT_CHECKLIST.md` says `UAT Ready: yes`
- `SCORECARD.md` has `Current score >= Target score`, `Unmet checklist items = 0`, `Blocking defects = 0`, and `Verdict: done`

`uat_complete` requires additional human sign-off:
- do not infer it from Playwright, browser-verifier, or static review
- record the owner and timestamp explicitly

## What Not To Do

Avoid:
- using browser E2E as the only form of coverage
- closing requirements without IDs
- claiming document completeness without a traceability artifact
- treating "manual later" as equivalent to evidence
- letting the generator author its own final completion verdict without a separate evaluator path

## Recommended Split Of Test Types

- Use E2E/browser tests for critical user journeys
- Use integration tests for domain flows and API boundaries
- Use unit tests for local branching logic and edge cases
- Use manual UAT only where human judgment is still required

This keeps runtime coverage meaningful without making the suite unmaintainable.
