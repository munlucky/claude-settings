---
name: project-memory
description: Collect, review, and explicitly import project knowledge from Codex/Claude sessions and the current codebase.
user-invocable: true
---

# Project Memory

Use `node scripts/kernel/standalone/project-memory.mjs <command>` with one of:

- `sessions` discovers Codex and Claude sessions and reports project mapping.
- `codebase` builds or refreshes the account-root Code Index and previews candidates.
- `review --source-file <snapshot>` verifies candidates, duplicates, and conflicts.
- `import --source-file <snapshot> --candidate <id,...> --approval-ref <ref>` commits only explicitly selected candidates.
- `status` reports knowledge revision, imports, and Code Index freshness.

Raw transcripts, system/developer prompts, tool output, secrets, and credentials are never persisted in Kernel knowledge. Manual import never creates a Kernel Run, completion decision, or mutation revision; it uses the `user_approved_import` authority and writes an import receipt under Runtime Home.
