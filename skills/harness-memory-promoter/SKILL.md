---
name: harness-memory-promoter
description: Promote explicitly approved reusable project or harness knowledge after review, replay, rollback, and release evidence gates.
triggers:
  - "promote harness memory"
  - "promote memory candidates"
  - "harness memory promotion"
---

# Harness Memory Promoter

Use this skill only when the user explicitly asks to promote reusable project knowledge into global or harness memory. Project-local facts are not promoted by default.

## Required Inputs

Promotion must consume durable manifests instead of raw transcript or graph dumps:

- proposal: `improvement/proposals/<proposalId>.yaml`
- independent review: `improvement/reviews/<proposalId>-review.yaml`
- replay evidence: `improvement/replay/<proposalId>-replay.json`
- rollback evidence for harness stable promotion: `improvement/rollback/<proposalId>-rollback.json`
- release manifest for harness stable promotion: `improvement/releases/<proposalId>-release-manifest.json`

For harness self-improvement, the meta-project contract is:

```yaml
projectId: moonshot-harness-core
knowledgeRoot: "%USERPROFILE%/.codex/state/projects/moonshot-harness-core/knowledge"
improvementRoot: "%USERPROFILE%/.codex/state/projects/moonshot-harness-core/improvement"
candidateReleaseRoot: "%USERPROFILE%/.codex/harness/releases/candidate"
stableReleaseRoot: "%USERPROFILE%/.codex/harness/releases/stable"
```

## Required Flow

1. Run from the `claude-settings` repository root.
2. Load the proposal and evidence manifests.
3. Validate the proposal with `knowledge-improvement-lifecycle.mjs`.
4. Deny transcript-only, imported-only, secret-like, or untrusted external candidates with a durable reason.
5. For `global-candidate`, require independent review and replay evidence before promotion.
6. For `harness-meta-project` candidate promotion, require independent review, replay, and targeted self-test evidence.
7. For `harness-meta-project` stable promotion, require independent review, affected-project replay, targeted self-test, rollback, and release manifest evidence.
8. Write compact promoted facts only after the lifecycle helper returns `approved_for_promotion`.

## Hard Rules

- Never promote project-local facts by default.
- Never write directly from a source project into the harness graph.
- Never promote raw project graph dumps, raw logs, or raw transcripts.
- Denials are durable evidence and must include a denial code and reason.
- Unsafe promotion denial must not block unrelated workflow.
- If MemoryGraph is unavailable, report the promotion write skip or failure; do not treat it as success.
- Preserve provenance tags including source project, proposal id, review id, replay id, and release manifest id when applicable.
