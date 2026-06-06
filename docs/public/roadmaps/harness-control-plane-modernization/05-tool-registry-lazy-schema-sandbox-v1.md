# Phase 05 - Tool Registry, Lazy Schema, and Sandbox Boundary v1

## Scope Status

Status: foundation-candidate-partial-implementation-phase

This v1 phase belongs to the Wave 1 foundation trace. Use the matching v2 phase for full-source modernization scope.

## Goal

Reduce tool/context tax and enforce execution boundaries by recording tool group selection, schema loading mode, approval-required operations, and sandbox violations in runtime state.

## Owned Paths

- `scripts/runtime-state.mjs`
- `scripts/lib/runtime-state-store.mjs`
- `schemas/verification.contract.yaml`
- `rules/security.md`
- `rules/workflow.md`
- `docs/public/guidelines/external-skill-pattern-transfer.md`
- `skills/workspace-isolation-gate/SKILL.md`
- `skills/completion-verifier/SKILL.md`
- `skills/moonshot-orchestrator/SKILL.md`
- `skills/moonshot-phase-runner/SKILL.md`
- `tests/tool-sandbox-eval-contract.test.mjs`

## Read-Only / Preserved Paths

- `.claude/**`
- `.codex/**`
- `.moonshot-relay/**`
- `.moonshot-state/**`
- account-root homes
- generated logs, traces, browser artifacts, verdict JSON, sqlite DB/WAL/SHM files except temp fixture data created by this phase's tests

## Dependencies

- Phase 02 complete.
- Phase 04 complete.

## Implementation Work

- Define tool group taxonomy with 12 or fewer public groups.
- Record tool calls with:
  - `tool_group`
  - `tool_name`
  - `status`
  - `schema_mode = summary | full | rejected`
  - payload metadata
- Define approval-required operations:
  - destructive file operation
  - dependency install
  - network access
  - external write
  - account-root install/sync
  - package publish/release
- Record approval-required operation events with:
  - operation category
  - target path or external target
  - approval ID when available
  - actor/writer identity
  - blocking status when approval is missing or invalid
- Define blocking sandbox events:
  - leased worktree escape
  - generated-state promotion into source
  - runtime DB or verdict output entering package payload
  - unauthorized account-root mutation
- Feed blocking sandbox and approval events into `assessCompletionAuthority()`.
- Update selected/skipped component metadata requirements in verifier/orchestrator docs.
- Preserve external harness pattern transfer policy:
  - accept testing discipline, ledger, local edit discipline, loop cap, sandbox/lifecycle control
  - reject public skill sprawl, AGENTS.md knowledge hoarding, default multi-agent fanout

## Acceptance Criteria

- Runtime store can record and read tool calls.
- Rejected schema/tool decisions are visible in status/evidence.
- Approval-required operation policy is documented in workflow/security and verifier docs.
- Sandbox violation and unauthorized approval-required operation fixtures block clean completion.

## Regression Contract

Extend `tests/tool-sandbox-eval-contract.test.mjs`.

Required test cases:

- Tool call with `summary`, `full`, and `rejected` schema modes records correctly.
- Out-of-scope write event blocks clean finish.
- Unauthorized destructive file, dependency install, network, account-root mutation, and external write events block clean finish.
- Missing selected/skipped component metadata degrades or blocks according to verification profile.
- External harness transfer doc names accepted and rejected patterns.

## Completion Evidence

- `node --test tests/tool-sandbox-eval-contract.test.mjs`
- `npm test`
- `git diff --check`
