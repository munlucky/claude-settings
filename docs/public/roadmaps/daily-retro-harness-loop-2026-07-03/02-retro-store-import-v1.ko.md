# Phase 02 - Retro Collect, Store, and Import

## Objective

작업 closeout evidence에서 `*.collect.json`을 생성하고, 프로젝트 outbox의 collect records를 검증해 account-root retro inbox로 가져오는 collect/import/store 계층을 구현한다.

## Surface Classification

- `source_only`: tools and tests.
- `data_or_state_migration`: runtime inbox write behavior, but only test temp roots during implementation.

## Owned Paths

```text
tools/retro/retro-cli.mjs
tools/retro/collect.mjs
tools/retro/retro-store.mjs
tools/retro/retro-normalize.mjs
tools/retro/daily-retro.mjs
tests/retro-collect-contract.test.mjs
tests/retro-redaction-contract.test.mjs
```

## Read-Only Paths

```text
tools/harness-lab/harness-history.mjs
scripts/project-identity.mjs
package.json
```

## Required Behavior

- `retro collect --project <id> --task-id <taskId> --task-root <dir> --date <YYYY-MM-DD> --out <dir> --json`.
- `retro import --project <id> --from <dir> --date <YYYY-MM-DD> --json`.
- default runtime root: `${MOONSHOT_RELAY_HOME:-~/.moonshot-relay}/state/projects/<projectId>/retro`.
- collect writes to `.moonshot-relay/retro-outbox/<YYYY-MM-DD>/` by default or to `--out`.
- collect refuses overwrite unless `--replace` is provided.
- import manifest records imported, skipped duplicates, rejected, inbox root, and `promotionAuthority: false`.
- secret-like strings reject import before copy.
- duplicate task IDs fail or skip deterministically; the policy must be documented and tested.

## Acceptance Criteria

- valid task fixture creates a collect record in a temp outbox.
- valid fixture records import into a temp inbox.
- missing required schema fields fail.
- secret-like fields fail.
- duplicate task handling is deterministic.
- no source tree runtime data is written in tests.

## Verification

```bash
node tools/retro/retro-cli.mjs collect --project fixture --task-id TASK-001 --task-root tests/fixtures/retro/task-full --date 2026-07-03 --out <temp-outbox> --json
node tools/retro/retro-cli.mjs import --project fixture --from tests/fixtures/retro/2026-07-03 --date 2026-07-03 --state-root <temp> --json
node --test tests/retro-collect-contract.test.mjs tests/retro-redaction-contract.test.mjs
npm run test:retro
```
