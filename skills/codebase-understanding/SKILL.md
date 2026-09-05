---
name: codebase-understanding
description: Build and query the regenerable account-root Code Index for the current Kernel project.
user-invocable: true
---

# Codebase Understanding

## Goal
Build and query the high-speed, regenerable account-root Code Index for the current Kernel project to provide accurate code intelligence without bloating prompt context.

## Context
- **Command**: `node scripts/kernel/standalone/codebase-understanding.mjs [--query <text>] [--json]`
- **Storage**: Stored in Kernel Runtime Home (`~/.moon-relay-kernel`), isolated from repository git tracking.

## Autonomy & Priorities
- Search queries and index builds are read-only regarding repository source and git state.
- Supports incremental refresh; never copy raw full-repository indexes into durable Project Knowledge.

## Definition of Done
- Query returns structured symbol/file references or index build completes with fresh digest.

## Verification
- Confirm query results match current code symbols or index build output status is `ready`.
