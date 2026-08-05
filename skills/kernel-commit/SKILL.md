---
name: kernel-commit
description: Safely commit explicit Git changes and optionally close out Kernel project knowledge.
user-invocable: true
---

# Kernel Commit

Use `node scripts/kernel/standalone/kernel-commit.mjs --message "..."` for an explicit Git closeout. The utility resolves project identity, applies the staging deny list, stages an explicit path list, creates a Git receipt, and verifies remote parity only when `--push` is requested.

`--memory-review` previews candidates. Without explicit `--approval-ref`, a Git commit may leave candidates staged but never auto-commits Project Knowledge. Runtime state, provider sessions, receipts, Code Index files, and protected repository paths are never staged.
