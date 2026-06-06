# Scorecard

| Gate | Result | Evidence |
| --- | --- | --- |
| Active default test gate | Pass | `npm test` 48/48 |
| Package gate | Pass | `npm run test:package` 32/32 |
| Active reference guards | Pass | `tests/active-contracts.test.mjs` |
| Archive boundary | Pass | active tests no longer import archive runtime helpers |
| Browser-flow setup gap | Pass | structured `setup_gap` verdict test |
| Guideline reference existence | Pass | `docs/public/guidelines/**` references resolve |
| MemoryGraph state root | Pass | stale `.claude/cache` default seed guard |
| Materialization dry-run | Pass | `planned[]` count matches `copiedCount` |
| Installer smoke | Pass | CLI and account-root harness dry-runs |
| Browser runtime shell | Pass | `bash bin/browserctl --help` |
| Whitespace | Pass | `git diff --check` |

Overall: pass.
