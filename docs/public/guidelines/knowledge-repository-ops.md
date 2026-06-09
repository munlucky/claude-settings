# Knowledge Repository Ops

Canonical source guideline for knowledge repository maintenance and audit operations.

Knowledge repository changes must distinguish canonical source, account-root state, and generated project-local state.
Run the active knowledge audit after structural doc or knowledge layout changes when the entrypoint is installed.
Do not package sqlite databases, logs, traces, cache directories, or verdict JSON as source knowledge.
Migration work should report source path, destination path, preservation behavior, and cleanup boundaries.

## Project-Local Knowledge Anchors

Projects may expose reusable local knowledge through `knowledgeAnchors` in their root `AGENTS.md`.

Anchors should be compact and prompt-safe:

- stable `id`
- `package` path under the project agreement repository
- `startHere` path for the smallest useful entry document
- optional `index` path
- keywords and a compact summary
- `mustConsultFor` conditions that tell orchestration skills when the anchor applies

Anchors are always-loaded discovery metadata, not permission to inline every referenced document. Workflows should read the anchor first, then load only the specific agreement documents needed for the current task.

Do not put project-specific anchors in Moonshot Relay canonical source. Keep them in the consuming project's `AGENTS.md` and agreement repository.

## Memory Promotion Ledger

Reusable knowledge promotion is a controlled workflow, not a side effect of project refresh or phase completion.
Before any promoted fact is written to long-term memory, record a runtime ledger decision with:

- fresh evidence
- reviewer approval
- replay result
- rollback plan
- scope owner

The ledger authority is `runtime-state.sqlite` through `scripts/runtime-state.mjs record-memory-promotion`.
Promotion denial is durable evidence and should not block unrelated phase work.
Project knowledge and promoted memory can inform context warnings, but they are never completion authority.

Rollback uses `scripts/runtime-state.mjs rollback-memory-promotion`.
Rollback supersedes the active promoted decision and writes a new rollback decision; it must not delete the original audit row.
Stale promoted knowledge should appear as `compactStatus.staleWarnings` and `resumeBrief.memoryWarnings`, not as an accepted completion verdict.
