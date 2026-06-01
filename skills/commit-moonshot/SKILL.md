---
name: commit-moonshot
description: Update project memory and commit when the user explicitly wants both.
triggers:
  - "commit-moonshot"
  - "moonshot commit"
  - "memory commit"
---

# Project Memory Update & Commit

Supported public utility entrypoint. Use only when the user explicitly wants memory refresh plus commit.

## Purpose

- refresh project memory before commit
- keep the memory summary short
- exclude `.claude/memory.json` and `.claude/memorygraph/` from commits by default after refreshing memory
- create a Korean commit title and grouped bullet body

## Required flow

1. inspect staged changes with compact git commands
2. resolve `PROJECT_ID` through the Project Identity Resolver; do not derive durable identity directly from the current directory name
3. run `node .claude/scripts/commit-moonshot-memory-refresh.mjs --project-id <PROJECT_ID>` when the project has the script; if a prior `mcp__memory__.store_memory` call failed, pass the same payload through `--store-json @<payload-file>` and the MCP error through `--mcp-error`
4. run `node .claude/scripts/commit-moonshot-promotion-audit.mjs --project-id <PROJECT_ID> --json` when the project has the script; this is audit-only by default
5. summarize created or updated memory facts, direct fallback route, AWTL promotion audit counts, and promotion candidates in a short bullet list
6. keep `.claude/memory.json`, `.claude/memorygraph/`, and `.claude/cache/memorygraph/` unstaged unless the user explicitly asks to include memory artifacts
7. build a filtered staging path list before `git add`; remove generated bridge paths, ignored files, and local MCP/memory artifacts
8. create the commit in Korean

## Hard rules

- always refresh memory before commit
- do not read `.claude/docs/ko/` as a memory source; it is a human-facing Korean mirror
- do not store facts derived only from `.claude/docs/ko/`
- do not store system, developer, `AGENTS.md`, `.claude/rules/**`, or workflow hard rules as project memory; record duplicates under `projectMemory.omitted.duplicatedSystemRules`
- never auto-stage account-root knowledge state, `.claude/memory.json`, or `.claude/memorygraph/` by default
- never auto-stage `.claude/cache/memorygraph/` by default
- never auto-stage generated agent bridge paths such as `.agents/` or `.agents/skills`; omit them from explicit `git add -- <paths>` lists unless the user explicitly asks to track generated bridge files
- never run `git add -A -- .agents`, `git add -A -- .agents/skills`, or any generated explicit path list that still contains `.agents` or `.agents/skills`
- before running `git add -- <paths>`, filter the candidate path list with these deny patterns: `.agents`, `.agents/**`, `.mcp.json`, `.claude/memory.json`, `.claude/memorygraph/**`, `.claude/cache/memorygraph/**`
- if the candidate list was produced from tool output or a previous assistant step, re-check it manually before execution; ignored/generated paths must be removed even when they appear in the user's pasted command
- prefer root directories and policy files for installer commits: `.claude`, `.codex`, `.claudeignore`, `.gitattributes`, `.gitignore`, `AGENTS.md`, plus any explicitly changed product docs/code; never include `.agents`
- only stage memory artifacts when the user explicitly asks to include memory in the commit
- if MemoryGraph MCP is unavailable, treat it as `mcp_transport_failed -> direct_fallback`; record the failure only after the direct fallback also fails, then continue the Git closeout when the user explicitly requested commit/push
- do not auto-promote project candidates into `moonshot-relay` during a normal project commit; run the AWTL promotion audit and write only when `--write-verified` is justified by replay evidence or explicit approval
- use `commit-moonshot-promotion-audit.mjs --write-verified` only when the user explicitly asked for long-term promotion, for example `장기메모리승격 포함`, `승격 승인`, or `write verified memory`
- keep failed-turn cases as next-run recall cache; do not treat `.claude/cache/awtl/failed_turn_cases.jsonl` itself as a long-term MemoryGraph source
- warn before committing when product implementation changes are mixed with `.claude/scripts/**`, `.claude/skills/**`, or `.claude/verification.contract.yaml` changes
- require `QA_REPORT.md` to contain a `Harness Change Ledger` entry when harness/tool changes were made during a product phase
- keep the user-facing summary and commit body grouped by feature area
- keep the summary compact; avoid long prose dumps

## Codex MCP Transport Fallback

If the Memory MCP already attached to Codex Desktop fails with `Transport closed`, do not require a Codex restart. Immediately use the commit refresh helper, which starts a fresh MemoryGraph stdio child process and writes an auditable log under `.claude/logs/memorygraph/`:

```bash
node .claude/scripts/commit-moonshot-memory-refresh.mjs --project-id <PROJECT_ID> --mcp-error "Transport closed"
```

Rules:
- Treat `Transport closed` as a failed Codex app-server MCP transport, not as a failed memory payload.
- If the direct fallback succeeds, memory refresh is complete and the user does not need to restart Codex.
- If a concrete `store_memory` payload failed through MCP, save that payload to a temporary JSON file and rerun the helper with `--store-json @<payload-file>` so the same content is written through direct fallback.
- If no concrete payload is available, the helper runs `memorygraph-project-index.mjs` and `memorygraph-direct.mjs refresh-seed` as the commit-time memory refresh.
- On Windows, if the sandbox blocks `memorygraph.exe`, rerun the same command with an approval-based escalated shell.
- The helper has per-command timeout and owned child-process tree cleanup. It must not broad-kill unrelated `memorygraph.exe` processes.
- The direct fallback uses `.claude/memorygraph/memory.db` through `MEMORY_SQLITE_PATH` as a project-local compatibility graph; keep account-root knowledge state, `.claude/memorygraph/**`, and `.claude/cache/memorygraph/**` unstaged unless the user explicitly includes memory artifacts.

## AWTL Promotion Audit

After memory refresh and before Git staging, run the commit-time AWTL promotion audit when available:

```bash
node .claude/scripts/commit-moonshot-promotion-audit.mjs --project-id <PROJECT_ID> --json
```

Rules:
- The default mode is audit-only. It may update `.claude/cache/awtl/replay_scorecard.jsonl`, but it must not write MemoryGraph facts.
- Use `--write-verified` only when the user explicitly asked for long-term promotion or approval in the current commit turn.
- `--approval approved` represents explicit human approval; do not infer it from a generic commit request.
- MemoryGraph write failures from this audit are non-blocking for Git closeout.
- Report `promotable`, `needs_replay`, `needs_human_approval`, `blocked`, `memorygraph_unavailable`, and `written` counts in the closeout summary.

## References

- [Commit Moonshot Reference](/Users/dev/claude-settings/.claude/docs/reference/commit-moonshot-reference.md)
- [Token Optimization Guidelines](/Users/dev/claude-settings/.claude/docs/guidelines/token-optimization.md)

---

User context: $ARGUMENTS

## Project Knowledge Boundary

Commit closeout memory refresh is non-blocking. It can refresh or audit project knowledge after verification, but it is not part of attempt/system prompt assembly and must not put raw MemoryGraph/KG/ontology/log/transcript payloads into commit summaries or manifests.

Git closeout may record only knowledge refresh status, warning codes, and promotion/audit counts. MemoryGraph transport failure must not block commit/push when the user explicitly requested Git closeout.

Account-root project knowledge state is runtime state, not a commit payload. Repo commits may include reviewed summaries, evidence manifests, contracts, or explicit promotion candidates, but not raw knowledge state.
