# Output Compaction

Use compact output first, full output on demand.

## Default Entry Points

- `node .claude/scripts/knowledge-repo-audit.mjs --compact`
- `node .claude/scripts/verify-phase-runtime-parity.mjs --compact <plan> --render-only`
- `bash .claude/scripts/token-safe-git.sh status`
- `bash .claude/scripts/token-safe-git.sh diff-stat`

## Rules

- Summaries should include verdict, counts, and artifact path.
- Full logs belong in artifacts or tmp roots, not chat by default.
- If a compact summary fails, the next message should name the exact log file to inspect.
- Do not duplicate unchanged command output in multiple artifacts.
