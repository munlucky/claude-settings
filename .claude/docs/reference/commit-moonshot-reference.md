# Commit Moonshot Reference

## Minimal Flow

1. Inspect staged scope with compact git commands.
2. Refresh project memory.
3. Summarize created or updated entities in a short bullet list.
4. Keep `.claude/memory.json` unstaged unless the user explicitly asks to include it.
5. Stage docs and code only.
6. Create a Korean one-line title plus bullet body commit.

## Compact Summary Format

```md
### Project Memory Update Complete

- Project: {PROJECT_ID}
- Created: {count}
- Updated: {count}
- Relations: {count}
- Boundary updates: {count}
```
