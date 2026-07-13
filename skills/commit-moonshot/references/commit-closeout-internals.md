# Commit Closeout Internals

Load only for MemoryGraph transport fallback or AWTL promotion auditing.

## Transport fallback

- Treat `Transport closed` as an app-server transport failure, not a rejected memory payload.
- Retry through `commit-moonshot-memory-refresh.mjs` with the same payload and error.
- A successful direct fallback completes memory refresh without a restart.
- Use approval-based escalation only when the platform sandbox blocks the owned helper.
- Never broad-kill unrelated MemoryGraph processes or stage legacy cache/state by default.

## Promotion audit

- Run `commit-moonshot-promotion-audit.mjs --project-id <PROJECT_ID> --json` before staging when available.
- Default to audit-only. `--write-verified` and `--approval approved` require explicit current-turn authority.
- MemoryGraph audit write failure is non-blocking for an explicitly requested Git closeout.
- Report `promotable`, `needs_replay`, `needs_human_approval`, `blocked`, `memorygraph_unavailable`, and `written` counts.
