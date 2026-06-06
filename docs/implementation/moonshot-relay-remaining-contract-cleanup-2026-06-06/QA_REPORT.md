# QA Report - Moonshot Relay Remaining Contract Cleanup

## Execution Context

- Plan package: `docs/implementation/moonshot-relay-remaining-contract-cleanup-2026-06-06`
- Master plan: `00-master-plan-v1.md`
- Execution mode: in-session parent implementation with independent implementation review
- Knowledge context: `status=not_configured`, `strictness=advisory`, `stage=execute`, `blocking=false`
- Live profile adoption: not performed

## Phase Results

| Phase | Result | Evidence |
|-------|--------|----------|
| 01 README Installer Runtime Docs | pass | README memory/template/install guidance aligned; `install-claude.ps1` WSL wording fixed; Codex profile README title fixed; active README drift test added |
| 02 Active Test Side-Effect And Archive Boundary | pass | archive verifier moved to legacy test; active test no longer executes archive verifier; browser-flow shell test skips on non-Git-Bash and Node-level setup-gap contract remains active |
| 03 Package Contract Manifest Boundary | pass | `.moonshot-state/**` and Codex runtime exclusions added; materializer denylist expanded; broad Claude plugin `scripts` entry removed; dry-run planned source/verdict distinction tested |
| 04 Skill Agent Profile Path Wording | pass | source-like `.claude/skills` and `.claude/agents` references replaced with canonical paths; classifier test added for allowed installed-profile contexts |
| 05 Public Guideline Depth Policy | pass | guideline classification recorded in `docs/public/repository-layout.md`; active classification test added |

## Verification Evidence

| Command | Result |
|---------|--------|
| `node scripts/knowledge-context-build.mjs --cwd . --stage execute --json` | pass, advisory not_configured |
| `node --test --test-name-pattern "README install guidance rejects stale runtime paths" tests/active-contracts.test.mjs` | pass |
| `node --test --test-name-pattern "active tests do not execute archive compatibility scripts" tests/active-contracts.test.mjs` | pass |
| `node --test --test-name-pattern "browser flow missing runner uses temp verdict path and leaves repo state unchanged|browser flow setup gap payload shape is contractually defined|active archive boundary scan has zero violations" tests/active-contracts.test.mjs` | pass, Git Bash/MSYS shell execution skipped because available `bash` is WSL/GNU/Linux |
| `npm run test:legacy-archive` | pass |
| `npm run test:package` | pass |
| `node --test --test-name-pattern "skill and agent docs do not present .claude skills or agents as source" tests/active-contracts.test.mjs` | pass |
| `node --test --test-name-pattern "public guidelines are resolved from docs/public and classified" tests/active-contracts.test.mjs` | pass |
| `npm test` | pass, 58 pass / 1 skipped |
| `node package/build-package.mjs --runtime all --dry-run --json` | pass, planned counts: claude=422, codex=330 |
| exact stale README/install `rg` scan | pass, no hits |
| human-facing `.claude/docs/guidelines` `rg` scan | pass, no hits |
| temp-home `node bin/moonshot-relay.mjs install --runtime all --dry-run --moonshot-home ... --claude-home ... --codex-home ...` | pass, account root not touched |
| `git diff --check` | pass |

## Independent Review

| Review | Result | Notes |
|--------|--------|-------|
| implementation review | finding fixed | Initial review found the Git Bash/MSYS-only missing-runner test could fail as `browserctl_unavailable`; test now injects a temp executable `browserctl`. |
| targeted follow-up review | pass | Findings: none. Reviewer confirmed the missing-runner path and runtime-state snapshot issues are closed. |

## Harness Change Ledger

| Area | Change | Guard |
|------|--------|-------|
| active contracts | Added README/install, archive boundary, browser setup-gap, profile-path, and guideline classification guards. | `npm test`; targeted `node --test --test-name-pattern ... tests/active-contracts.test.mjs` |
| package materialization | Expanded generated-state exclusions and removed broad plugin `scripts` entry. | `npm run test:package`; dry-run planned output |
| skill/agent guidance | Replaced source-like `.claude/skills` and `.claude/agents` references with canonical root paths while preserving explicit installed-profile wording. | profile-path classifier test |
| public docs | Recorded public guideline classification and durable source ownership. | public guideline classification test |

## Residual Risk

- Git Bash/MSYS is not installed on this machine; the shell-level browser-flow missing-runner execution test is skipped in that environment. Node-level source contract coverage remains active and full `npm test` records the skip.
- Existing local runtime artifacts are treated as baseline state. The added verifier side-effect contract compares repository-local runtime file paths, sizes, and mtimes when a Git Bash/MSYS runtime is available.
