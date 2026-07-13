# Compatibility Contract Reference

Machine-readable compatibility anchors. Load only for compatibility audit.

## Default Paths

These are compatibility installed-profile paths, not canonical source ownership.

- `.claude/memory.json`
- `.claude/memorygraph/`
- `.claude/cache/memorygraph/`
- `.moonshot-relay/docs/ko/`
- `.claude/rules/**`
- `.agents/`
- `.agents/skills`
- `.agents/**`
- `.claude/memorygraph/**`
- `.claude/cache/memorygraph/**`
- `.claude/cache/awtl/failed_turn_cases.jsonl`
- `<MOONSHOT_RELAY_HOME>/scripts/**`
- compatibility installed profile path: `.claude/skills/**`

## Hard Stops

- always refresh memory before commit
- do not read `.moonshot-relay/docs/ko/` as a memory source; it is a human-facing Korean mirror
- do not store facts derived only from `.moonshot-relay/docs/ko/`
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
- warn before committing when product implementation changes are mixed with `<MOONSHOT_RELAY_HOME>/scripts/**`, `.claude/skills/**`, or `.claude/verification.contract.yaml` changes
- require `QA_REPORT.md` to contain a `Harness Change Ledger` entry when harness/tool changes were made during a product phase
- for Moonshot Relay harness/package/profile changes, require full Operational Adoption Closeout evidence before claiming commit-ready state: independent completion audit, independent operational adoption audit, source `doctor.mjs check --json`, `skills-audit.mjs audit --lock skills.lock.json --runtime-surface package/runtime-surface.json --json`, `npm run test:lab`, `npm run test:package`, `npm run test:eval`, `npm test`, package dry-run, and, when live account-root adoption occurred, live install `installId`, installed doctor with explicit `--repo-root`, `--lock`, and `--runtime-surface` paths, installer JSON `profileSurfaceParity`, and `profileSurfaceParity[runtime=codex].extraCanonicalCount=0`
- when commit/push closeout is requested, do not claim push completion until `git rev-parse HEAD` equals `git rev-parse origin/<branch>` after `git push`; record this parity result with the push closeout evidence
- keep the user-facing summary and commit body grouped by feature area
- keep the summary compact; avoid long prose dumps
- when a phase runner `runId` and `goalId` are available, pass them to commit memory/audit helpers so commit closeout writes runtime events under the active identity
- if no active runtime identity exists, helpers use an audit-only commit closeout identity; that identity is evidence only and must not be treated as whole-plan completion authority
- record staging, commit, and push outcomes through `node <MOONSHOT_RELAY_HOME>/scripts/commit-moonshot-closeout-event.mjs --event-type <type> --payload-json <json> --json`; do not hand-write ad hoc `runtime-state record-event` calls for commit closeout taxonomy
- The helper has per-command timeout and owned child-process tree cleanup. It must not broad-kill unrelated `memorygraph.exe` processes.
- The default mode is audit-only. It may update `.claude/cache/awtl/replay_scorecard.jsonl`, but it must not write MemoryGraph facts.
- Use `--write-verified` only when the user explicitly asked for long-term promotion or approval in the current commit turn.
- `--approval approved` represents explicit human approval; do not infer it from a generic commit request.
