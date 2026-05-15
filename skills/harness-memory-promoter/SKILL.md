---
name: harness-memory-promoter
description: Promote approved reusable project knowledge into the claude-settings harness MemoryGraph.
triggers:
  - "promote harness memory"
  - "promote memory candidates"
  - "harness memory promotion"
---

# Harness Memory Promoter

Use this skill when the user explicitly approves promotion of reusable project knowledge into the harness graph.
Promotion is gated by replay evidence or human approval, and the resulting fact must stay compact with provenance tags.

## Required Flow

1. Run from the `claude-settings` repository root.
2. Read the source project's `.claude/cache/memorygraph/promotion-candidates.json`.
3. Filter out project-specific domain facts, one-off details, secrets, and `.claude/docs/ko/` derived facts.
4. Invoke `harness-memory-promoter` with `approval: approved`.
5. Store accepted items with:
   - `project:claude-settings`
   - `source:moonshot`
   - `origin:awtl`
   - `origin_turn:{turnId}`
   - `origin_run:{runId}`
   - `origin_candidate:{candidateId}`
   - `validated_by:{method}`

## AWTL Promotion Contract

- Failed-turn candidates must include `failure_turn_id`.
- `--write-memorygraph` is required for direct writes; without it, the correct `write_status` is `not_requested` or `skipped`.
- `--auto-promote verified-only` is the only automatic write policy. Everything else requires explicit human approval.
- Append each decision to the replay scorecard with `denial_codes`, `write_status`, `applies_to`, `does_not_apply_to`, `validated_by`, and `last_validated_at`.
- Deny candidates with `imported_only`, `transcript_only`, `raw_trace_payload`, `missing_failure_turn_id`, `invalid_candidate`, or `memorygraph_unavailable` as applicable.

## Hard Rules

- Never write directly from the source project into the harness graph.
- Never promote raw project graph dumps.
- Keep promoted memories compact and reusable.
- If MemoryGraph is unavailable, report the failure and do not block unrelated work.
- Do not promote transcript-only or imported-only candidates, and preserve environment/flaky/harness blockers.
- Never treat unavailable MemoryGraph as success. It is a promotion write skip/failure, not a general workflow blocker.
