# Handoff - Moonshot Relay Remaining Contract Cleanup

## Status

Implementation complete. Independent implementation review found one Git Bash-only test issue; it was fixed by using a temp executable `browserctl` and strengthening runtime-state snapshots to include file size/mtime. Targeted follow-up review returned findings none.

## Changed Areas

- README/install guidance now routes primary install through Node/npx and treats `install-claude.sh` as macOS/Git Bash compatibility.
- Active contracts now guard README stale paths, archive execution separation, browser-flow setup-gap payload shape, skill/agent profile-path wording, and public guideline classification.
- Package contract and materializer now include `.moonshot-state/**` plus Codex runtime-local cache/sqlite/memories/sessions exclusions.
- Claude plugin manifest no longer exposes broad `scripts` as a consumer-facing entry.
- Source-like `.claude/skills` and `.claude/agents` references were replaced with canonical root paths; installed-profile references remain explicitly labeled.
- Public guideline files are classified in `docs/public/repository-layout.md`.

## Rerun Commands

```powershell
npm test
npm run test:package
npm run test:legacy-archive
node package/build-package.mjs --runtime all --dry-run --json
git diff --check
```

## Notes

- Available `bash` on this machine is WSL/GNU/Linux, not Git Bash/MSYS, so the Git Bash-specific browser-flow shell execution test is skipped by design.
- No account-root install or local `.claude/.codex` adoption was performed.
