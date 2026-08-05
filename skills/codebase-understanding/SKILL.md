---
name: codebase-understanding
description: Build and query the regenerable account-root Code Index for the current Kernel project.
user-invocable: true
---

# Codebase Understanding

Run `node scripts/kernel/standalone/codebase-understanding.mjs` to build the full Code Index, or add `--query <text>` to search it. The index is stored under Kernel Runtime Home, supports source-tree cache hits and incremental refresh, and is not copied into Project Knowledge or the repository.
