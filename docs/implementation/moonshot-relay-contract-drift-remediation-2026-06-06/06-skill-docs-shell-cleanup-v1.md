# Phase 06 - Skill Docs Shell Cleanup v1

## Objective

Clean up remaining skill/docs/reference/shell platform drift after runtime and installer contracts are corrected.

## Phase Execution Metadata

```yaml
phase: 06
dependsOn: [01, 02, 03, 05]
ownedPaths:
  - skills/moonshot-relay-maintainer/SKILL.md
  - skills/moonshot-relay-maintainer/SKILL.ko.md
  - agents/verification-agent.md
  - agents/verification-agent.ko.md
  - skills/commit-moonshot/SKILL.md
  - skills/session-logger/SKILL.md
  - docs/public/guidelines/*.md
  - .gitattributes
  - archive/scripts/legacy-phase-adapters/verify-shell-syntax.mjs
  - scripts/lib/shell-command-diagnostics.mjs
  - skills/moonshot-relay-setup/SKILL.md
  - skills/moonshot-relay-setup/SKILL.ko.md
  - skills/moonshot-relay-setup/scripts/install-account-root.ps1
  - skills/moonshot-relay-setup/scripts/install-account-root.sh
  - tests/active-contracts.test.mjs
  - tests/harness-regression-contract.test.mjs
  - tests/package-materialization.test.mjs
readOnlyPaths:
  - docs/public/repository-layout.md
  - docs/public/installer-usage.md
liveMutationPolicy: no installed profile edits; source skill/agent/docs only
```

## Issue F1 - Maintainer Skill Source vs Profile Paths

| Loop | Result |
|------|--------|
| Improvement v1 | Replace `.claude/skills` current contract checks with root `skills/` paths. |
| Review 1 | `.claude` remains valid as installed profile path. |
| Improvement v2 | Separate canonical source examples from installed profile examples. |
| Review 2 | Sync command still points at non-existent `.claude/skills/.../sync_downstream_claude.py`. |
| Final v3 | Use `skills/moonshot-relay-maintainer/scripts/sync_downstream_claude.py` as source command; label installed profile paths explicitly. |

## Issue F2 - Verification Agent Active Gate

| Loop | Result |
|------|--------|
| Improvement v1 | Add `npm test` to verification-agent examples. |
| Review 1 | Verification agent is generic; do not overfit all projects to moonshot-relay. |
| Improvement v2 | Add moonshot-relay source checkout default while keeping project-native tests generic. |
| Review 2 | `.claude/agents/verification` should be installed-profile only. |
| Final v3 | Document source path `agents/verification/verify-changes.sh`, installed path `.claude/...`, and moonshot-relay active gate `npm test` distinctly. |

## Issue F3 - Broken docs/public/reference Links

| Loop | Result |
|------|--------|
| Improvement v1 | Create missing reference files. |
| Review 1 | Shallow reference files would add more weak docs. |
| Improvement v2 | Point links to existing guidelines or skill-local references. |
| Review 2 | If references are truly needed, split into a separate reference-doc phase. |
| Final v3 | Remove or retarget broken links and add missing-link guard for `docs/public/**` references. |

## Issue F4 - Guideline Depth Contract

| Loop | Result |
|------|--------|
| Improvement v1 | Expand all 22 guideline files. |
| Review 1 | Volume alone does not improve durable policy. |
| Improvement v2 | Add minimum structure: scope, policy, required evidence, anti-patterns, owner. |
| Review 2 | KO/EN sync can broaden scope. |
| Final v3 | Add durable minimum structure to all public guidelines, then defer deep topic rewrites to later packages. Keep tests focused on structure, not word count. |

## Issue F5 - PS1 LF and Shell Syntax False-Fails

| Loop | Result |
|------|--------|
| Improvement v1 | Add `*.ps1 text eol=lf`. |
| Review 1 | Also need tests that PS1 files are scanned. |
| Improvement v2 | Extend line-ending test to PS1 and normalize existing PS1 files. |
| Review 2 | `verify-shell-syntax` also false-fails on Windows backslash paths. |
| Final v3 | Add PS1 LF policy/tests and normalize path handling in shell syntax verifier or move diagnostic logic into shared active library. |

## Issue F6 - Setup Wrapper and CODEX_HOME Fallback

| Loop | Result |
|------|--------|
| Improvement v1 | Add setup wrapper scripts to syntax/LF gate. |
| Review 1 | Network smoke is flaky; prefer static/parser tests. |
| Improvement v2 | Add deterministic parser/argument handoff checks. |
| Review 2 | PowerShell setup docs and script both need `$env:CODEX_HOME` fallback. |
| Final v3 | Guard setup shell/PS scripts statically, add PowerShell `$HOME/.codex` fallback in docs and script, and keep network install smoke optional. |

## Acceptance Criteria

- Maintainer skill no longer presents `.claude/skills/...` as source command path.
- Verification agent distinguishes source checkout, installed profile, and project-native gates.
- No missing `docs/public/reference/*` links remain.
- Public guidelines meet durable minimum structure.
- PS1 LF policy is enforced.
- Windows backslash input does not false-fail shell syntax verification.
- Setup wrappers are included in static syntax/LF guards and have CODEX_HOME fallback.

## Verification

- `npm test`
- `git diff --check`
- `node --test tests/active-contracts.test.mjs tests/harness-regression-contract.test.mjs tests/package-materialization.test.mjs`
- PowerShell parser check for PS1 files
- Targeted scans for `.claude/skills/.../sync_downstream_claude.py`, missing `docs/public/reference`, and CRLF in PS1 files

## Risks

- Public guideline deepening can sprawl. Keep this phase to durable minimum structure and defer content-rich rewrites.
