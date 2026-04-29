---
name: moonshot-harness-maintainer
description: Maintain the Moonshot harness and downstream .claude installs. Use when adopting external skill or harness patterns, improving moonshot-orchestrator or moonshot-phase-runner policy, fixing runtime parity or completion-gate fixtures, updating commit-memory defaults, or syncing shared .claude assets into target projects while preserving project-local PROJECT.md, memory, settings, logs, and task docs.
---

# Moonshot Harness Maintainer

## Purpose

Apply reusable Moonshot harness improvements without expanding the public skill surface by default. Keep orchestration policy, runtime contracts, downstream installs, and verification evidence aligned.

## Operating Rules

- Prefer pattern transfer over new public skills. Add a new skill only when it has a distinct trigger, distinct output contract, and changes orchestration decisions.
- Keep `moonshot-orchestrator`, `product-orchestrator`, and `moonshot-phase-runner` as stable entrypoints.
- Put detailed external-skill adoption criteria in `.claude/docs/guidelines/external-skill-pattern-transfer.md` and link it from orchestrator policy.
- Keep completion gates strict. Fix stale fixtures, prompts, or artifacts before relaxing gate logic.
- Treat `.claude/memory.json`, `.claude/memorygraph/`, `PROJECT.md`, `.mcp.json`, `settings.local.json`, logs, runtime artifacts, and downstream task docs as project-local unless the user explicitly says otherwise.
- For commit workflows, refresh memory when requested by the local policy, but keep memory artifacts unstaged unless the user explicitly asks to include them.

## Workflow

1. Inspect the current harness contract:
   - `.claude/skills/moonshot-orchestrator/SKILL.md`
   - `.claude/skills/moonshot-phase-runner/SKILL.md`
   - `.claude/scripts/verify-phase-runtime-parity-shell-core.sh`
   - `.claude/scripts/agent-loop-phase-plan-lib.mjs`
   - `.claude/verification.contract.yaml`
2. Classify the change:
   - external pattern transfer
   - compact system prompt or `Claude.md` workflow pattern transfer
   - orchestrator or phase-runner policy update
   - runtime parity or completion-gate fixture update
   - downstream `.claude` synchronization
   - commit or memory policy update
3. Apply the smallest durable change:
   - stage-owner SKILL.md update
   - guideline/reference update
   - template or fixture update
   - script update
   - deferred pilot entry
4. Preserve project-local state when syncing downstream `.claude`.
5. Run validation and report exact skips, especially unavailable real runtimes.

## External Pattern Transfer

When importing lessons from another skill repository or video:

1. Extract patterns, not files.
2. Map each pattern to an existing local owner.
3. Update the owner or a reference guide.
4. Add a public skill only if existing owners would mix unrelated responsibilities.
5. Record why rejected patterns are not imported.

For the detailed checklist, read `.claude/docs/guidelines/external-skill-pattern-transfer.md`.

When the source is an image or compact prompt, do not copy it wholesale. Extract reusable workflow mechanics, classify already-covered items, and transfer only gaps into existing stage owners.

## Runtime Parity Fixes

For `verify-phase-runtime-parity.sh` failures:

- First compare generated fixtures with the current completion contract.
- Update `seed_fixture()` or runtime smoke phase docs when artifacts are stale.
- Keep completion gate sources strict unless the contract itself is wrong.
- Expected completion alignment includes fresh verification evidence, review completion, plan conformance pass, `OBJ-CONFORM`, `Verdict: done`, `Current task status: FULL`, and completed `phase-status.yaml`.

Recommended checks:

```bash
bash -n .claude/scripts/verify-phase-runtime-parity-shell-core.sh
node --check .claude/scripts/agent-loop-phase-plan-lib.mjs
bash .claude/scripts/verify-phase-runner-boundary.sh
PHASE_RUNTIME_PARITY_KEEP_TMP=true bash .claude/scripts/verify-phase-runtime-parity.sh .claude/docs/runtime-parity-reference-plan
```

## Downstream Sync

Use `scripts/sync_downstream_claude.py` for conservative `.claude` synchronization:

```bash
python3 .claude/skills/moonshot-harness-maintainer/scripts/sync_downstream_claude.py \
  --source .claude \
  --dry-run \
  /path/to/project-a /path/to/project-b
```

Then run it without `--dry-run` after confirming targets.

The script syncs shared harness files and directories only. It intentionally preserves project-local files, local settings, memory, logs, verification artifacts, and project task docs.

## Validation

Use checks proportional to the change:

```bash
bash .claude/scripts/knowledge-repo-audit.sh
bash .claude/scripts/verify-code-policy.sh
bash .claude/scripts/workflow-enforcement.sh verify
bash .claude/scripts/verify-phase-runner-boundary.sh
git diff --check
```

When syncing downstream projects, also run:

```bash
HARNESS_KNOWLEDGE_AUDIT_FILE=/tmp/<project>-knowledge-audit.json bash .claude/scripts/knowledge-repo-audit.sh
bash -n .claude/scripts/knowledge-repo-audit.sh
bash -n .claude/scripts/verify-code-policy.sh
bash -n .claude/scripts/workflow-enforcement.sh
node --check .claude/scripts/agent-loop-phase-plan-lib.mjs
```

## Reporting

Report:

- source harness and target projects
- whether `PROJECT.md`, memory, settings, logs, and task docs were preserved
- key files or owners changed
- validation commands and pass/fail/skip status
- any pre-existing dirty worktree changes left untouched
