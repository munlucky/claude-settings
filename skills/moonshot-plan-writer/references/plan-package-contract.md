# Plan Package Contract

Moonshot plan writing is file-backed work. A plan package is not complete when the assistant only emits a chat-level proposal.

## Required Files

Every runnable plan package must have:

- `00-master-plan-v<version>.md`
- one `NN-<phase-slug>-v<version>.md` file per phase
- `planning-loop/plan-quality-review-iter-<NN>.yaml` or a documented degraded-review note
- adoption surface classification in the master plan and in every phase that mutates a non-source-only surface
- policy source paths for every concrete gate command or a recorded missing-policy blocker

If `docs/implementation` already contains unrelated root-level plan files, create a slugged package root such as `docs/implementation/<plan-slug>/` and put the full package there.

## Project-Neutral Adoption Surfaces

The plan writer owns generic surface classification, not project-specific commands. Classify planned mutations with these categories:

- `source_only`
- `package_runtime_payload`
- `installed_profile_or_account_root`
- `external_deployment_or_service`
- `data_or_state_migration`

For each non-source-only surface, record:

- policy source paths consulted, such as root instructions, verification contracts, deployment runbooks, package contracts, or migration policies
- required evidence slots, such as preflight or dry-run, independent review, targeted tests, build/package verification, post-adoption verification, rollback evidence, and git closeout parity
- whether concrete commands are sourced from project policy, phase-local design, or still missing

Do not make this contract depend on Moonshot Relay-specific harness commands. Repository-specific gates belong in the consuming project's policy sources and must be imported into the plan only when that project is the target.

## Closure Evidence

Before reporting completion:

1. List expected file paths.
2. Verify every path exists with `Test-Path`, `test -f`, or equivalent.
3. Search the package root for objective keywords with `rg -n`.
4. Verify that every non-source-only mutation has surface classification, policy source paths, and required evidence slots.
5. Report missing files or missing policy gates as `status: incomplete` or `status: blocked`.

Project memory and knowledge context can identify stale packages and likely naming collisions, but the filesystem closure check is the authority for completion.
