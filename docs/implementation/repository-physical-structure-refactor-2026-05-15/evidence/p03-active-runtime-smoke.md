# P03 Active Runtime Smoke

Scenario coverage uses open -> act -> mutate -> persist -> recover evidence rather than smoke-only assertions.

## P03-SCN-01 Active agents load repository instructions

- Open: read `.claude/CLAUDE.md` after the change.
- Act: verified it remains a short TOC and still references `.claude/verification.contract.yaml`.
- Mutate: updated the TOC to name `.claude/` as a development profile while preserving runtime contract links.
- Persist: `rg -n "canonical source|development profile|generated state" .claude/README.md .claude/CLAUDE.md` exited 0.
- Recover: active runtime fallback remains `.claude/CLAUDE.md` plus `.claude/verification.contract.yaml`; no runtime launchers were removed.

## P03-SCN-02 Canonical source edits do not require `.claude/skills` source edits

- Open: read `.claude/README.md` and existing canonical source boundary docs.
- Act: documented canonical roots and generated-profile roots in `.claude/profile-contract.yaml`.
- Mutate: added `tests/package-materialization.test.mjs` to validate the boundary.
- Persist: `node --test tests/package-materialization.test.mjs --test-name-pattern "dev profile"` passed 3/3.
- Recover: `.claude/skills`, `.claude/agents`, `.claude/scripts`, `.claude/schemas`, and `.claude/templates` remain available as generated-profile or compatibility paths during migration.

## P03-SCN-03 Runtime artifacts remain outside payloads

- Open: read `package/package-contract.yaml` generated-state exclusions.
- Act: mirrored profile exclusions in `.claude/profile-contract.yaml`.
- Mutate: test asserts package/profile exclusions for logs, cache, traces, browser artifacts, browser runtime, sqlite state, memorygraph, temp dirs, audit outputs, and verdict JSON.
- Persist: materialization test passed and `git diff --check` exited 0.
- Recover: no blocked runtime-state files were edited.
