# 05 Install Command Contract v2

## Goal

Correct setup and manual install instructions so users do not follow stale root-local `.claude/.codex` or missing script paths.

## Dependencies

- Phase 1 guard rules.
- Phase 4 guideline/reference cleanup.

## Owned Paths

- `README.md`
- `skills/moonshot-relay-setup/SKILL.md`
- `skills/moonshot-relay-setup/SKILL.ko.md` if present
- `install-claude.sh`
- `install-claude.ps1`
- `bin/moonshot-relay.mjs`
- installer smoke tests under `tests/`

## Work

- Make `npx -y github:munlucky/moonshot-relay install` or `node bin/moonshot-relay.mjs install --runtime all` the primary install path.
- Fix `moonshot-relay-setup` to reference skill-local installer scripts only when that is the intended installed-skill path.
- Remove or replace manual `cp moonshot-relay/.claude`, `cp moonshot-relay/.codex`, and `git add .claude .codex` guidance.
- Clarify that `install-claude.sh` is for supported macOS/Git Bash compatibility paths, while WSL/Linux should use the Node installer path unless shell support is added.

## Acceptance Evidence

- `node bin/moonshot-relay.mjs install --dry-run --runtime all` passes.
- `node scripts/install-account-root-harness.mjs --runtime all --dry-run --json` passes.
- README and setup skill command snippets are covered by a smoke or static command-path test.
- WSL/Linux unsupported shell behavior is documented or converted to a structured supported path.

## Phase Boundary

Do not make root `.claude/**` or `.codex/**` a source package payload to satisfy stale copy instructions.
