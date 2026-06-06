# Phase 04 - Skill Agent Profile Path Wording v1

## Goal

Remove remaining source-like `.claude/skills` and `.claude/agents` wording from reusable skills and agents while preserving explicit installed-profile compatibility references.

## Owned Paths

- `skills/product-gate-reviewer/SKILL.md`
- `skills/product-gate-reviewer/SKILL.ko.md`
- `agents/context-builder.md`
- `agents/context-builder.ko.md`
- `agents/documentation-agent.md`
- `agents/documentation-agent.ko.md`
- `agents/requirements-analyzer.md`
- `agents/requirements-analyzer.ko.md`
- `skills/failure-analyzer/SKILL.md`
- `skills/moonshot-in-session-coordinator/SKILL.md`
- `skills/moonshot-in-session-coordinator/SKILL.ko.md`
- `skills/codex-review-code/SKILL.md`
- `skills/codex-review-code/SKILL.ko.md`
- `skills/qa-flow/SKILL.md`
- `skills/qa-flow/SKILL.ko.md`
- `skills/vercel-react-best-practices/AGENTS.ko.md`
- `skills/moonshot-teams-runner/SKILL.md`
- `skills/moonshot-teams-runner/SKILL.ko.md`
- `skills/workspace-isolation-gate/SKILL.md`
- `skills/workspace-isolation-gate/SKILL.ko.md`
- any additional skill/agent file found by the phase-specific scan where `.claude/skills` or `.claude/agents` is presented as source; add it to this owned list before editing
- `tests/active-contracts.test.mjs`

## Read-Only Paths

- root `.claude/skills/**` and `.claude/agents/**` generated/local profile output
- account-root installed profiles

## Required Changes

1. For source references, replace `.claude/skills/...` with `skills/...`.
2. For source references, replace `.claude/agents/...` with `agents/...`.
3. Keep installed-profile compatibility references only when the surrounding text explicitly says installed profile, materialized profile, or compatibility entrypoint.
4. Add or strengthen active contract tests to block future source-like `.claude/skills` and `.claude/agents` references while allowing explicit compatibility wording.
5. Review Korean paired files where the English file changes.

## Scan Classification

| Class | Rule | Examples |
|-------|------|----------|
| rewrite candidate | `.claude/skills` or `.claude/agents` names a source file, template, skill definition, or doc to edit/read as durable source | `agents/requirements-analyzer*`, `skills/product-gate-reviewer*`, `skills/failure-analyzer*`, `skills/codex-review-code*`, `skills/vercel-react-best-practices/AGENTS.ko.md`, `skills/moonshot-teams-runner*` |
| allowed compatibility reference | same-line or adjacent-line context explicitly says installed profile, local profile, profile materialization, compatibility entrypoint, generated runtime output, hydration check, or generated/local profile warning | `agents/verification-agent*`, `agents/context-builder/templates/*`, `skills/workspace-isolation-gate*` if the wording is runtime-availability focused, `skills/commit-moonshot*` when warning about mixed local profile changes |
| test violation | any remaining match without the allowed context rule | new test failure |

## Acceptance Criteria

- No skill/agent file tells maintainers to edit, copy, or treat `.claude/skills` or `.claude/agents` as canonical source.
- Legitimate installed-profile compatibility references remain clear and intentional.
- Active contract test named `skill and agent docs do not present .claude skills or agents as source` covers English, Korean, and `AGENTS*.md` files under `skills/` and `agents/`.
- Raw `rg` matches are allowed only when the context classifier accepts them; pass/fail is based on zero violations after classification, not zero raw matches.

## Verification Commands

```powershell
rg -n "\\.claude/(skills|agents)" skills agents docs/public README.md tests
node --test --test-name-pattern "skill and agent docs do not present .claude skills or agents as source" tests/active-contracts.test.mjs
```

## Non-Goals

- Do not remove legitimate installed-profile runtime references.
- Do not rewrite skill behavior beyond path authority wording.
