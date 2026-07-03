# Phase 01 - Retro Contract and Docs

## Objective

회고 루프의 source/runtime 경계, 스키마, 템플릿, public guideline을 먼저 고정한다.

## Surface Classification

- `source_only`: schemas, templates, docs, tests, fixtures.
- `data_or_state_migration`: runtime path policy only; no runtime data committed.

## Owned Paths

```text
schemas/retro.collect.schema.json
schemas/retro.daily.schema.json
schemas/retro.improvement-candidate.schema.json
schemas/retro.import-result.schema.json
schemas/retro.issue-draft.schema.json
templates/retro/**
docs/public/guidelines/daily-retro-workflow.md
docs/public/guidelines/daily-retro-workflow.ko.md
docs/public/repository-layout.md
tests/fixtures/retro/**
tests/retro-collect-contract.test.mjs
tests/retro-no-promotion-authority-contract.test.mjs
```

## Read-Only Paths

```text
AGENTS.md
schemas/verification.contract.yaml
tools/harness-lab/harness-history.mjs
schemas/improvement-candidate-v1.schema.json
schemas/improvement-proposal.schema.json
```

## Acceptance Criteria

- collect, daily, improvement candidate, import result, and issue draft schemas exist.
- schemas require or constrain `promotionAuthority: false`.
- docs state that runtime retro data is generated advisory state.
- collect schema stores evidence refs and summaries, not raw logs or transcripts.
- retro improvement candidate schema is an advisory envelope that maps to or references existing improvement candidate/proposal schemas instead of silently forking them.
- `docs/public/repository-layout.md` classifies `daily-retro-workflow*.md` in the Public Guideline Classification table.
- fixtures cover at least three tasks with repeated and isolated failure classes.

## Verification

```bash
node --test tests/retro-collect-contract.test.mjs tests/retro-no-promotion-authority-contract.test.mjs
npm test
```

## Risks

- Overly broad schema may allow raw content. Mitigate with explicit size limits and redaction tests.
- Overly narrow schema may block useful evidence. Mitigate with `evidence` refs and `candidateLessons` summaries.
