# Phase 03 - Daily Analysis

## Objective

하루치 retro inbox를 읽어 반복 실패, review risk, replan 분포, candidate lesson 패턴을 산출한다.

## Surface Classification

- `source_only`: analysis tools, templates, tests.
- runtime daily outputs are generated advisory state.

## Owned Paths

```text
tools/retro/daily-retro.mjs
tools/retro/retro-patterns.mjs
templates/retro/DAILY_RETRO.md
tests/daily-retro-contract.test.mjs
```

## Required Behavior

- `retro daily --project <id> --date <YYYY-MM-DD> --json`.
- read inbox records from runtime state.
- aggregate FULL/PARTIAL/NO, score average, replan count, review finding counts, and failure class frequency.
- repeated failure class threshold starts at 2.
- isolated project-specific failures do not automatically become harness improvement candidates.
- write `daily-retro.json` and `daily-retro.md`.

## Acceptance Criteria

- fixture with three records emits repeated pattern for shared failure class.
- fixture with one isolated failure records observation without high-priority proposal.
- generated daily JSON and markdown include `promotionAuthority: false`.
- deterministic IDs remain stable across runs.

## Verification

```bash
node tools/retro/retro-cli.mjs daily --project fixture --date 2026-07-03 --state-root <temp> --json
node --test tests/daily-retro-contract.test.mjs
npm run test:retro
```

