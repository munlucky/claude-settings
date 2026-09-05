---
name: project-memory
description: Collect, review, and explicitly import project knowledge from Codex/Claude sessions and the current codebase.
user-invocable: true
---

# Project Memory

## Goal
Discover, review, and safely import durable project knowledge candidates from sessions and codebases into the Kernel knowledge store under explicit user governance.

## Context
- **Command**: `node scripts/kernel/standalone/project-memory.mjs <sessions|codebase|review|import|status> [options]`
- **Subcommands**:
  - `sessions`: Discovers provider sessions mapped to current project.
  - `codebase`: Refreshes Code Index and previews extracted candidates.
  - `review`: Validates candidate schema, duplicates, and conflicts.
  - `import`: Commits approved candidates via `--candidate <id>` and `--approval-ref <ref>`.
  - `status`: Reports knowledge revision, imports, and index freshness.

## Autonomy & Priorities
- **Zero Raw Bloat**: Never persist raw conversation transcripts, prompts, secrets, or tool outputs into knowledge.
- **Explicit Approval Only**: Manual candidate import requires explicit `--approval-ref`; never auto-commit tacit knowledge without confirmation.

## Definition of Done
- Import receipt written under Runtime Home and knowledge revision incremented.

## Verification
- Run `node scripts/kernel/standalone/project-memory.mjs status` to confirm import receipt and candidate status.
