# Token Architecture Map

This repository uses five token-control layers.

## 1. Document Hierarchy

- Tier 1: [`AGENTS.md`](/Users/dev/claude-settings/AGENTS.md), [`.claude/CLAUDE.md`](/Users/dev/claude-settings/.claude/CLAUDE.md)
- Tier 2: short guideline indexes such as `document-memory-policy.md` and `token-optimization.md`
- Tier 3: detailed playbooks in `docs/reference/**`

## 2. Output Compaction

- Compact command entrypoints:
  - [`knowledge-repo-audit.mjs --compact`](/Users/dev/claude-settings/.claude/scripts/knowledge-repo-audit.mjs)
  - [`verify-phase-runtime-parity.mjs --compact`](/Users/dev/claude-settings/.claude/scripts/verify-phase-runtime-parity.mjs)
  - [`token-safe-git.sh`](/Users/dev/claude-settings/.claude/scripts/token-safe-git.sh)

## 3. Token Audit

- [`token-optimization-audit.mjs`](/Users/dev/claude-settings/.claude/scripts/token-optimization-audit.mjs)
- Reports:
  - `.claude/docs/reports/token-optimization-baseline.json`
  - `.claude/docs/reports/token-optimization-latest.json`

## 4. Session Compaction

- [`session-compaction.md`](/Users/dev/claude-settings/.claude/docs/guidelines/session-compaction.md)
- [`SESSION_INDEX.md`](/Users/dev/claude-settings/.claude/templates/session/SESSION_INDEX.md)

## 5. Context Graph

- [`build-context-graph.mjs`](/Users/dev/claude-settings/.claude/scripts/build-context-graph.mjs)
- Cache:
  - `.claude/cache/context-graph.json`
