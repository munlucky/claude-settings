---
name: moonshot-retro
description: Use for advisory retrospective collection, daily pattern analysis, and local improvement proposal or issue draft generation.
triggers:
  - "retro collect"
  - "daily retro"
  - "retrospective"
  - "harness improvement candidate"
---

# Moonshot Retro

## Role

Collect compact task closeout summaries, import them into the account-root retro inbox, aggregate daily patterns, and render advisory harness improvement proposals or local issue drafts.

This skill does not change verification, score, closeout, promotion, installed profile, or runtime DB authority.

## Commands

```bash
moonshot-relay retro collect --project <id> --task-id <taskId> --task-root <dir> --date <YYYY-MM-DD> --out .moonshot-relay/retro-outbox/<YYYY-MM-DD> --json
moonshot-relay retro import --project <id> --from .moonshot-relay/retro-outbox/<YYYY-MM-DD> --date <YYYY-MM-DD> --json
moonshot-relay retro daily --project <id> --date <YYYY-MM-DD> --json
moonshot-relay retro propose --project <id> --date <YYYY-MM-DD> --json
moonshot-relay retro issue-draft --project <id> --date <YYYY-MM-DD> --json
```

## Hard Stops

- Do not copy raw logs, prompts, transcripts, browser scrapes, MemoryGraph dumps, KG dumps, ontology dumps, or secret-like strings into retro records.
- Do not treat retro output as completion authority.
- Do not create remote GitHub issues from this initial workflow.
- Do not mutate `.claude/**`, `.codex/**`, account-root profiles, or source files from a retro finding.

## Required Evidence

- `promotionAuthority: false` on generated JSON and proposal artifacts.
- Focused retro tests for schema, redaction, aggregation, proposals, issue drafts, and CLI routing.
- `npm test` before claiming source implementation complete.

