---
name: test-driven-development
description: Enforce red-green-refactor evidence before behavior-changing implementation work.
surfaceStatus: internal_stage_owner
---

# Test-Driven Development

## Role

Require a test-first discipline for behavior-changing work before `implementation-runner`.

This is an internal Execute-stage owner.
Users should normally enter through `moonshot-orchestrator` or `moonshot-phase-runner`, not this skill directly.

For plan-document work, treat the detailed spec item as the TDD unit. Each behavior-changing `REQ-*`, `SCN-*`, or UAT-critical item should have a `specTestObligations` row with `verificationMode: tdd_red_green` unless `characterization_first` or `evidence_mandatory` is explicitly justified.

## When to Use

Use for:
- new behavior
- bug fixes
- refactors that can change behavior
- API, UI, or workflow changes with observable outcomes
- meta-harness improvements, including completion gates, phase runners, state/projection writers, workflow enforcement, runtime parity, and downstream sync logic

May be bypassed only when the task is docs-only, read-only, or test-first evidence is genuinely infeasible.
If bypassed, record why and name the alternate verification path.
Bypass never removes the spec-test obligation. `evidence_mandatory` still needs `requiredCommand`, `evidencePath`, and `bypassReason`; `not_applicable` is limited to non-behavioral items.

For meta-harness work, bypass is exceptional. MemoryGraph recall, manual diagnosis, or source inspection can justify what to test, but cannot replace RED/GREEN executable evidence.

## Required Evidence

```yaml
tddEvidence:
  mode: tracer-bullet-red-green-refactor | bypassed
  cycles:
    - behavior: ""
      publicInterface: ""
      red:
        command: ""
        expectedFailure: ""
        evidence: ""
      green:
        command: ""
        evidence: ""
  refactorBoundary: ""
  bypassReason: ""
  alternateVerification: ""
```

## Workflow

1. Identify the smallest observable behavior through a public interface.
2. Write or select exactly one failing test for that behavior before production code changes.
3. Run the test and capture the expected failure.
4. Implement only the minimal code needed to pass that one test.
5. Run the passing test and relevant regression checks.
6. Repeat the next RED -> GREEN cycle only after the prior cycle is green.
7. Refactor only after all active cycle tests are green and only inside the declared boundary.
8. Record cycle evidence in `SPRINT_CONTRACT.md` and `QA_REPORT.md`.
9. When plan artifacts contain `specTestObligations`, run `scripts/spec-test-obligations.mjs validate --json` and pass failures into `scripts/verification-plane.mjs record-summary --spec-test-obligations-json`.

## Meta-Harness Asset Rule

When the changed system is the harness itself:

- Treat the regression test or fixture as a durable asset, not a throwaway check.
- Prefer tests that exercise public harness boundaries: CLI output, exported decision functions, state/projection files, package materialization, or verifier/gate metadata.
- If the incident came from another workspace, import the smallest reproducible fixture or encode the behavior in the closest owner test before porting the fix.
- Add the test to the nearest existing suite unless a new suite is clearly needed.
- Record the incident class in the test name or assertion message so future failures explain what regression was caught.
- MemoryGraph may index the incident and the test path, but the test file is the source of enforcement.

## Tracer Bullet Rules

- One behavior test at a time.
- Tests verify observable behavior, not private methods or internal structure.
- Prefer integration-style tests through public interfaces when feasible.
- Do not write all tests first and then all implementation.
- Do not add speculative code for future tests.
- Never refactor while the active cycle is red.
- A good test should survive internal refactors when behavior stays the same.

## Blocking Conditions

- No failing test or explicit bypass reason exists for behavior-changing work.
- The proposed first implementation batch changes production code before test evidence.
- The bypass reason names convenience rather than genuine infeasibility.
- Meta-harness behavior changes rely on MemoryGraph, manual log analysis, or source inspection without a durable executable regression.
- The plan uses a horizontal batch such as "write all tests, then implement all code" for behavior-changing work.
- The test asserts implementation details when a public behavior interface is available.

## Output

```yaml
signals:
  tddReady: true
notes:
  - "tdd: red evidence captured"
  - "tdd: green evidence captured"
```
