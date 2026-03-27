# Workflow Guide

## Purpose
- Define the official implementation flow for this project.
- Clarify which document or script is the source of truth when conflicts appear.

## Document Priority
1. `AGENTS.md` / `.claude/CLAUDE.md`
2. `.claude/PROJECT.md`
3. `README.md`
4. `TEST_GUIDE.md`
5. `docs/design/README.md`
6. `docs/glossary/README.md`
7. `docs/daily/README.md`
8. `docs/analysis/README.md`
9. feature or product docs under `docs/`

## Runtime Roles
- **Claude**: [implementation / planning / verification role]
- **Codex**: [implementation / review / impact analysis role]
- **Kimi or other research tool**: [optional research role]

## Standard Entry Points
- **Primary command or prompt**: [command / workflow entry]
- **Large work / phase command**: [command / workflow entry]
- **Verification command**: [command]
- **Daily log command or habit**: [how logs are updated]

## Branch / Workspace Policy
- Branch naming: [rule]
- Worktree or isolated workspace rule: [rule]
- Dirty workspace policy: [rule]

## Implementation Flow
1. Confirm scope and references.
2. Read `docs/design/README.md`, `docs/glossary/README.md`, `TEST_GUIDE.md`, and relevant `docs/analysis/*`.
3. Implement with project conventions.
4. Run verification.
5. Update docs and daily logs.
6. Record follow-up items.

## Required Update Rules
- If API/structure/policy changes, update the related docs immediately.
- If a new UI pattern appears, update `docs/design/README.md` before or together with implementation.
- If a new term appears, update `docs/glossary/README.md` before or together with implementation.

## Notes
- Keep this file concise and project-specific.
- Prefer explicit commands and paths over vague process language.
