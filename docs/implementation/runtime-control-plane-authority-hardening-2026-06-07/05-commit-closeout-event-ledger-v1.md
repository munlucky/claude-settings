# Phase 05 - Commit Closeout Event Ledger

## Goal

Make `commit-moonshot` closeout observable through runtime events without turning memory refresh, promotion audit, staging, or Git results into completion authority.

## Dependencies

- Phase 01 closeout model.
- Phase 02 identity taxonomy.

## Owned Paths

- `skills/commit-moonshot/SKILL.md`
- `skills/commit-moonshot/SKILL.ko.md`
- `docs/public/reference/commit-moonshot-reference.md`
- `scripts/commit-moonshot-memory-refresh.mjs`
- `scripts/commit-moonshot-promotion-audit.mjs`
- `tests/commit-memory-refresh-contract.test.mjs`
- optional new `tests/commit-closeout-runtime-events-contract.test.mjs`

## Read-Only Paths

- account-root knowledge state
- `.claude/memory.json`
- `.claude/memorygraph/**`
- `.claude/cache/memorygraph/**`
- raw MemoryGraph/KG/ontology/log/transcript payloads

## Required Decisions

- Use active `runId` and `goalId` when the caller provides them.
- If no active identity exists, create or use an audit-only commit closeout identity that cannot satisfy whole-plan completion.
- Commit closeout events are evidence and audit trail only.
- Raw memory payloads must not be written into runtime event payloads.

## Event Taxonomy

- `commit.closeout.started`
- `commit.memory_refresh.completed`
- `commit.memory_refresh.failed`
- `commit.memory_refresh.skipped`
- `commit.promotion_audit.completed`
- `commit.promotion_audit.failed`
- `commit.promotion_audit.skipped`
- `commit.staging.selected`
- `commit.created`
- `commit.failed`
- `commit.push.skipped`
- `commit.push.requested`
- `commit.push.completed`
- `commit.push.failed`

## Severity Rules

- Successful and skipped informational events use `info`.
- MemoryGraph unavailable with direct fallback success uses `warning` or typed degraded payload, not `blocking`.
- Git failures or unsafe staging findings use `blocking` only when they stop the requested closeout.
- No commit event can create an accepted completion decision.

## Acceptance Evidence

- Runtime DB row tests verify event type, severity, run/goal identity, and sanitized payload.
- MemoryGraph unavailable remains non-blocking for commit closeout when direct fallback succeeds.
- Promotion audit counts are recorded without raw candidate payloads.
- Audit-only identity does not contaminate whole-plan completion.
