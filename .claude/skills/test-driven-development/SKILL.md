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

## When to Use

Use for:
- new behavior
- bug fixes
- refactors that can change behavior
- API, UI, or workflow changes with observable outcomes

May be bypassed only when the task is docs-only, read-only, or test-first evidence is genuinely infeasible.
If bypassed, record why and name the alternate verification path.

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
