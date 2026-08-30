---
name: kernel-commit
description: Safely commit explicit Git changes and optionally close out Kernel project knowledge.
user-invocable: true
---

# Kernel Commit

Use `node scripts/kernel/standalone/kernel-commit.mjs [--message "..."] [--push] [--json]` for an explicit Git closeout. The utility resolves project identity, applies the staging deny list, stages an explicit path list, creates a Git receipt, and verifies remote parity only when `--push` is requested.

After an accepted Kernel run, `--message` is optional. Its first non-empty line becomes the subject, and any remaining text is preserved under `요청 메시지:`. When it is omitted, the subject is derived from the run objective. In both cases the utility appends a bounded Korean task-context body containing the objective, run/project identity, plan and mutation revisions, completion and knowledge status, acceptance and verification summary, and selected changed paths. It does not copy raw evidence, runtime state, provider sessions, auth, or cache contents into the message. See [references/commit-message.md](references/commit-message.md) for the format.

Kernel finalization uses the same formatter. An explicit `gitCloseoutRequest.message` follows the same subject/body rule while retaining the generated task context.

`--memory-review` previews candidates. Without explicit `--approval-ref`, a Git commit may leave candidates staged but never auto-commits Project Knowledge. Runtime state, provider sessions, receipts, Code Index files, and protected repository paths are never staged.
