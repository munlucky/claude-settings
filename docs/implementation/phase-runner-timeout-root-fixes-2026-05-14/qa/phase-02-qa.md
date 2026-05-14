# Phase 02 QA Evidence

## Scope

Phase 02 implements bounded diff output policy:

- Worker prompts name `git diff --stat`, `git diff --name-only`, and `git diff --check` as defaults.
- Unbounded raw `diff --git` output is prohibited in worker logs, retry prompts, QA, HANDOFF, and closeout summaries.
- Path-limited raw patch context goes through `.claude/scripts/token-safe-git.sh raw-diff -- <path>` and is capped at 200 lines.
- Raw diff dominated timeout logs classify as `raw_diff_output_timeout`.

## Verification

```powershell
node --test .claude/scripts/agent-loop-phase-runner.test.mjs --test-name-pattern "diff output budget|raw diff retry policy"
node --test .claude/scripts/agent-loop-phase-runtime.test.mjs --test-name-pattern "raw diff timeout|raw diff dominated"
bash .claude/scripts/token-safe-git.sh raw-diff -- .claude/scripts/agent-loop-phase-runtime.mjs
git diff --check -- .claude/scripts/agent-loop-phase-plan-lib.mjs .claude/scripts/token-safe-git.sh .claude/scripts/agent-loop-phase-runtime.mjs .claude/scripts/agent-loop-phase-runner.test.mjs .claude/scripts/agent-loop-phase-runtime.test.mjs
```

All commands passed. The capped raw-diff smoke emitted 39 lines.

## Verdict

Phase 02 is verified for SCN-03, SCN-04, and SCN-04A.
