# Harness Recovery Playbook

## Purpose

Provide bounded recovery snippets that a proposer or coordinator can inject only when the matching failure mode is detected.

## Failure Modes

### review-closeout-repair

Use when:
- review evidence is missing
- `QA_REPORT.md` still says `Review completed: no`

Recovery target:
- workflow evidence
- QA / HANDOFF closeout fields
- phase-state closeout gating

### verification-evidence-repair

Use when:
- fresh verification evidence is missing
- verifier artifact exists but does not align with the active phase

Recovery target:
- verifier verdict path pinning
- bounded evidence refresh
- completion gate inputs

### knowledge-budget-trim

Use when:
- knowledge repository audit fails because the always-loaded budget is too high

Recovery target:
- `.claude/rules/**`
- knowledge repository guidance
- always-loaded document structure

## Safety Rule

Recovery playbooks may propose changes only inside the harness boundary.
They must not rewrite downstream project code or user task outputs outside `.claude/**`.
