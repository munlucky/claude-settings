---
name: kernel-commit
description: Safely commit explicit Git changes and optionally close out Kernel project knowledge.
user-invocable: true
---

# Kernel Commit

## Goal
Execute a safe, governed Git commit (and optional remote push) for an accepted Kernel run while enforcing staging deny-lists and recording verifiable Git receipts.

## Context
- **Command**: `node scripts/kernel/standalone/kernel-commit.mjs [--message "..."] [--push] [--json]`
- **Provenance Binding**: Resolves project identity and verifies run completion provenance.
- **Message Format**: Derives subject from objective or user prompt; appends bounded task-context body (run/project ID, mutation revisions, verification summary, changed paths). See [references/commit-message.md](references/commit-message.md).

## Autonomy & Priorities
- **Staging Fencing**: Explicitly stages only declared changed paths. Never stages runtime state, provider sessions, receipts, Code Index, or protected paths.
- **Knowledge Closeout**: `--memory-review` previews candidates. Without explicit `--approval-ref`, Git commit never auto-promotes unapproved Project Knowledge.

## Definition of Done
- Git commit created with authoritative hash and receipt recorded.
- If `--push` is specified, remote parity verified against upstream branch.

## Verification
- Run `git status -s` and inspect git log to ensure only expected paths were committed and working tree is clean.
