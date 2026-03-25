# Coding Style Guidelines

## Purpose

Keep always-loaded style rules short. Include only constraints that are hard to infer from code.

## Required

- Prefer small, focused edits over broad rewrites.
- Prefer immutable updates for JS/TS state/data changes.
- Keep files maintainable (hard cap: 800 lines per file).
- Add comments only when intent is not obvious from code.

## Prohibited

- Leave debug logs (`console.log`) in committed code.
- Leave `TODO`/`FIXME` without an issue reference.
- Add style-only rules that duplicate defaults of the language/framework.

## Framework-Specific Note

- For React/Next.js performance reviews, use `.claude/skills/vercel-react-best-practices/SKILL.md`.
- For React/web UI implementation or redesign, use `.claude/skills/frontend-design/SKILL.md` before code generation when visual direction matters.
