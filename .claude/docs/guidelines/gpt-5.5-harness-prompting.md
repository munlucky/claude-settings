---
title: GPT-5.5 Cross-Runtime Harness Prompting
description: Outcome-first prompt, retrieval, validation, and phase replay policy for Codex and Claude Code
lastReviewed: 2026-05-02
---

# GPT-5.5 Cross-Runtime Harness Prompting

Use this policy for Moonshot phase, bounded-direct, and runtime-adapter work that must behave consistently in Codex and Claude Code.

## Outcome-First Contract

Prefer a short contract that defines:

- goal
- success criteria
- constraints
- output
- stop rules

Keep exact process steps only when the path is a true invariant, such as review-before-finish, verification evidence, security, phase return boundary, or no raw MemoryGraph/CodeReviewGraph output.

## Effort Profile

- Default `modelEffortProfile`: `standard`.
- `economy`: parity smoke or narrow read-only checks.
- `standard`: normal phase, bounded, review, and implementation work.
- `deep`: runtime/core/architecture/security risk, failed retry evidence, or hard cross-module reasoning.
- `max`: exceptional asynchronous long-horizon work.

`deep` and `max` require a concrete `Effort escalation reason` in `SPRINT_CONTRACT.md`, `QA_REPORT.md`, and `workflowEvidence`. Codex maps the shared profile to `model_reasoning_effort`; Claude Code records the same profile and reason in prompts and artifacts.

## Retrieval Budget

Default budget:

```yaml
maxStageRecalls: 1
output: compact_summary
stopWhenAnswerable: true
repeatOnlyFor:
  - missing_owner
  - missing_date
  - missing_path
  - missing_api_or_schema
  - missing_failure_fact
forbidden:
  - raw_memorygraph_records_in_prompt
  - raw_code_review_graph_output_in_memorygraph
```

Pass MemoryGraph output only as summarized `projectMemoryContext`. Record CodeReviewGraph use as summary-only workflow evidence.

## Validation Profiles

- `prompt_only`: knowledge audit plus static/syntax contract checks.
- `docs_only`: documentation audit plus syntax integrity.
- `script_change`: shell/Node syntax plus targeted self-test when available.
- `workflow_core`: knowledge audit, code policy, workflow enforcement, runner boundary, worktree self-test.
- `runtime_adapter`: workflow enforcement, runtime parity, runner boundary, phase closeout.

Do not weaken benchmark or verification contracts to make a run pass.

## Phase Replay

When an adapter manually replays assistant history:

- preserve assistant-item `phase` values exactly
- use `commentary` for progress and preamble updates
- use `final_answer` only after return-boundary checks pass
- never add `phase` metadata to user messages
