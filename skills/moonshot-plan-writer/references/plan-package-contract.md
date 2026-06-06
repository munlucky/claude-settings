# Plan Package Contract

Moonshot plan writing is file-backed work. A plan package is not complete when the assistant only emits a chat-level proposal.

## Required Files

Every runnable plan package must have:

- `00-master-plan-v<version>.md`
- one `NN-<phase-slug>-v<version>.md` file per phase
- `planning-loop/plan-quality-review-iter-<NN>.yaml` or a documented degraded-review note

If `docs/implementation` already contains unrelated root-level plan files, create a slugged package root such as `docs/implementation/<plan-slug>/` and put the full package there.

## Closure Evidence

Before reporting completion:

1. List expected file paths.
2. Verify every path exists with `Test-Path`, `test -f`, or equivalent.
3. Search the package root for objective keywords with `rg -n`.
4. Report missing files as `status: incomplete` or `status: blocked`.

Project memory and knowledge context can identify stale packages and likely naming collisions, but the filesystem closure check is the authority for completion.
