# Token Quick Start

Use this repository in a token-efficient order.

## Default Reading Order

1. [`.claude/CLAUDE.md`](/Users/dev/claude-settings/.claude/CLAUDE.md)
2. Active task or phase document only
3. One targeted guideline for the current action
4. Artifact files referenced by the active phase or skill

## Default Command Order

1. Prefer compact commands first:
   - `.claude/scripts/token-safe-git.sh status`
   - `node .claude/scripts/knowledge-repo-audit.mjs --compact`
   - `node .claude/scripts/verify-phase-runtime-parity.mjs --compact ...`
2. Open full logs only when the compact summary is insufficient.
3. Prefer path lists, graph lookups, and artifact references before raw file reads.

## High-Value Rules

- Do not preload long guideline files unless the task explicitly needs them.
- Treat `HANDOFF.md`, `QA_REPORT.md`, and `SCORECARD.md` as the resumable state, not the entire prior session.
- Prefer summary-first output and artifact paths over replaying raw logs in chat.
- When a skill needs a long template, open its reference doc instead of duplicating the template body in the skill file.
