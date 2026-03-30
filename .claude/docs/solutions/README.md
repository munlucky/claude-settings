# Solution Memory

Last-Reviewed: 2026-03-30

## Purpose

This directory stores reusable solution assets promoted from execution artifacts such as `QA_REPORT.md`, `HANDOFF.md`, and session logs.

The goal is to turn repeated failures and fixes into reusable inputs for later planning and implementation.

## Asset Contract

Each solution asset should capture:

- problem type
- root cause
- fix pattern
- verification recipe
- anti-pattern
- reusable files or paths

## Promotion Rules

Promote an execution lesson into a solution asset when:

- the same failure pattern is likely to recur
- the remediation required more than one retry
- the fix included a reusable verification recipe
- the lesson changes future planning or guardrail decisions

Do not promote:

- one-off environment noise
- private or sensitive incident details that should not be reused
- vague observations without a fix or verification path

## Suggested Structure

```text
.claude/docs/solutions/
|-- README.md
|-- solution-asset.template.md
`-- contract-remediation-pattern.md
```

## Related Files

- `.claude/skills/session-logger/SKILL.md`
- `.claude/docs/guidelines/strategy-gate-rubric.md`
