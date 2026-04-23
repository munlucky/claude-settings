# Token Optimization Guidelines

This file is the short policy layer. Keep implementation details in reference docs and scripts.

## Five Active Tracks

1. **Document hierarchy**
   - keep Tier-1 docs short
   - move long examples and templates into `docs/reference/**` or `templates/**`
2. **Output compaction**
   - use compact summaries before opening raw logs
   - keep artifact paths in output so debugging remains possible
3. **Token audit**
   - measure line counts, compact output size, always-loaded token estimates, and graph reachability
4. **Session compaction**
   - keep resumable state in summary form
   - archive long timelines and raw review output
5. **Context graph**
   - compute likely dependent files before broad reads
   - prefer reachable subsets over repository-wide scans

## Required Operating Rules

- Prefer file paths and line references over pasted file bodies.
- Prefer YAML snapshots or short bullet summaries over JSON-heavy blobs when a payload is needed.
- Prefer one shared snapshot for parallel work instead of duplicating context.
- Prefer compact command entrypoints:
  - `node .claude/scripts/knowledge-repo-audit.mjs --compact`
  - `node .claude/scripts/verify-phase-runtime-parity.mjs --compact ...`
  - `bash .claude/scripts/token-safe-git.sh status`

## Measurement Rules

- Save a baseline report before structural changes.
- Save a latest report after changes.
- Compare:
  - active doc/skill line counts
  - compact command stdout lines
  - always-loaded estimated tokens
  - context graph node/edge counts and reachable subset size

## References

- [Token Quick Start](/Users/dev/claude-settings/.claude/docs/reference/token-quick-start.md)
- [Token Architecture Map](/Users/dev/claude-settings/.claude/docs/reference/token-architecture-map.md)
- [Output Compaction](/Users/dev/claude-settings/.claude/docs/guidelines/output-compaction.md)
- [Session Compaction](/Users/dev/claude-settings/.claude/docs/guidelines/session-compaction.md)
- [Token Common Mistakes](/Users/dev/claude-settings/.claude/docs/reference/token-common-mistakes.md)
