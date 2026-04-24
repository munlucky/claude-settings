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
  mode: red-green-refactor | bypassed
  failingTest:
    command: ""
    expectedFailure: ""
    evidence: ""
  passingTest:
    command: ""
    evidence: ""
  refactorBoundary: ""
  bypassReason: ""
  alternateVerification: ""
```

## Workflow

1. Identify the smallest observable behavior.
2. Write or select the failing test before production code changes.
3. Run the test and capture the expected failure.
4. Implement the minimal code needed to pass.
5. Run the passing test and relevant regression checks.
6. Refactor only inside the declared boundary.
7. Record evidence in `SPRINT_CONTRACT.md` and `QA_REPORT.md`.

## Blocking Conditions

- No failing test or explicit bypass reason exists for behavior-changing work.
- The proposed first implementation batch changes production code before test evidence.
- The bypass reason names convenience rather than genuine infeasibility.

## Output

```yaml
signals:
  tddReady: true
notes:
  - "tdd: red evidence captured"
  - "tdd: green evidence captured"
```
