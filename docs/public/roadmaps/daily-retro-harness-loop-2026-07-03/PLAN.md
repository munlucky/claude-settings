# Architecture Handoff Plan

## Handoff Target

This package hands off to `moonshot-plan-writer` for phase execution planning, then `moonshot-phase-runner` for implementation.

Reason:

- the work adds schemas, commands, docs, skills, tests, package payload changes, and CLI surface
- source changes should happen before runtime/profile adoption
- later installed profile/account-root sync is an explicit controlled adoption phase, not part of this architecture package

## Implementation Waves

| Wave | Phase | Scope | Surface |
|---|---|---|---|
| 0 | 01 | schemas, templates, guidelines, repository layout docs | `source_only` |
| 1 | 02 | retro collect, store, import, redaction, fixture data | `source_only`, `data_or_state_migration` design only |
| 2 | 03 | daily aggregation, pattern extraction, markdown report | `source_only` |
| 3 | 04 | proposer and issue draft renderer | `source_only`, external write deferred |
| 4 | 05 | bin routing, skill docs, README/package contract, package tests | `source_only`, `package_runtime_payload`; installed adoption deferred |

## Implementation Guardrails

- Do not write runtime retro data into tracked source except test fixtures.
- Do not add GitHub API writes in the first implementation.
- Do not alter `tools/harness-lab/harness-history.mjs` behavior in early phases.
- Do not mutate `.claude/**`, `.codex/**`, or account-root profiles during source implementation.
- Do not claim completion without `npm run test:retro` and `npm test`.

## Concrete Gate Commands

The repository policy uses `npm test` as the default active gate. New focused gates should be added by implementation:

```bash
npm run test:retro
npm test
node bin/moonshot-relay.mjs retro --help
node tools/retro/retro-cli.mjs import --project fixture --from tests/fixtures/retro/2026-07-03 --date 2026-07-03 --state-root <temp> --json
node tools/retro/retro-cli.mjs collect --project fixture --task-id TASK-001 --task-root tests/fixtures/retro/task-full --date 2026-07-03 --out <temp-outbox> --json
node tools/retro/retro-cli.mjs daily --project fixture --date 2026-07-03 --state-root <temp> --json
node tools/retro/retro-cli.mjs propose --project fixture --date 2026-07-03 --state-root <temp> --json
node tools/retro/retro-cli.mjs issue-draft --project fixture --date 2026-07-03 --state-root <temp> --json
```

## Handoff Artifact

This package includes `ARCHITECTURE_HANDOFF.json` with:

- handoff target: `moonshot-phase-runner`
- selected ADR IDs: `ADR-0001` through `ADR-0005`
- selected constraints for advisory-only authority, runtime state exclusion, draft-only GitHub behavior, candidate evidence threshold, and no installed profile mutation
- owned/read-only paths for implementation planning
- verification signal IDs for CLI, focused retro tests, full test gate, package dry-run, and installer dry-run

## Adoption Boundary

Runtime/profile adoption is a later controlled phase. Before that phase, source implementation may update package payload definitions and package tests, but it must not claim installed parity.
