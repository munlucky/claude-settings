---
name: moonshot-relay-maintainer
description: Maintain the Moonshot harness and downstream .claude installs. Use when adopting external skill or harness patterns, improving moonshot-orchestrator or moonshot-phase-runner policy, fixing runtime parity or completion-gate fixtures, updating commit-memory defaults, or syncing shared .claude assets into target projects while preserving project-local PROJECT.md, memory, settings, logs, and task docs.
---

# Moonshot Relay Maintainer

## Purpose

Apply reusable Moonshot harness improvements without expanding the public skill surface by default. Keep orchestration policy, runtime contracts, downstream installs, and verification evidence aligned.

## Operating Rules

- Prefer pattern transfer over new public skills. Add a new skill only when it has a distinct trigger, distinct output contract, and changes orchestration decisions.
- Keep `moonshot-orchestrator`, `product-orchestrator`, and `moonshot-phase-runner` as stable entrypoints.
- Put detailed external-skill adoption criteria in `.claude/docs/guidelines/external-skill-pattern-transfer.md` and link it from orchestrator policy.
- Keep completion gates strict. Fix stale fixtures, prompts, or artifacts before relaxing gate logic.
- Every harness behavior fix must follow TDD: add or select a deterministic regression test or fixture that reproduces the incident class, run it red or prove it would fail on the old behavior, then make the smallest code change to turn it green. Do not close a harness incident with source-only evidence.
- If a regression test is genuinely infeasible, record the bypass reason, the closest executable check, and the remaining recurrence risk in the handoff/report.
- Treat `.claude/memory.json`, `.claude/memorygraph/`, `PROJECT.md`, `.mcp.json`, `settings.local.json`, logs, runtime artifacts, and downstream task docs as project-local unless the user explicitly says otherwise.
- When a phase source plan invokes a project-owned CLI or npm/node command and the command surface is missing or narrower than the plan requires, classify it as a source-plan command surface incident. Fix and test the project-owned CLI in the target repo; sync only the reusable contract/skill lesson back to moonshot-relay, not the product CLI implementation.
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
3. Define the TDD regression contract:
   - Name the previous incident or failure mode in one sentence.
   - Add or select the smallest test/fixture that fails on the old behavior and passes after the fix.
   - Capture RED evidence before the implementation change when feasible; when the old behavior is only available from a prior workspace or commit, record the old-behavior proof instead of silently skipping RED.
   - Prefer public harness entrypoints over private implementation assertions: CLI commands, completion-gate output, runner metadata, workflow-enforcement scope, projection files, or package materialization output.
   - Cover both sides of any relaxed gate: the false positive that must no longer block and the true blocker that must still stop the loop.
   - Store durable fixtures under `tests/fixtures/` when they are source-owned regression inputs; keep generated logs, verdicts, and runtime state out of source unless they are explicit fixtures.
4. Apply the smallest durable change:
   - stage-owner SKILL.md update
   - guideline/reference update
   - template or fixture update
   - script update
   - deferred pilot entry
5. Preserve project-local state when syncing downstream `.claude`.
6. Run validation and report exact skips, especially unavailable real runtimes.

## TDD Incident Regression Contract

For every harness bug, anomaly, retry-loop failure, stale-state issue, projection mismatch, runtime parity failure, or completion-gate change:

1. Reconstruct the failure boundary before editing:
   - state authority involved (`STATE.md`, `current-run.json`, `latest-dispatch.json`, verdict JSON, scorecard, phase status)
   - writer or reader that made the wrong decision
   - expected public signal after the fix
2. Add or select at least one executable regression check before changing production harness code:
   - unit test for pure classifier or parser changes
   - fixture-backed CLI test for state/projection/gate behavior
   - self-test only when it exercises the actual public decision path
   - package/materialization hash check when source/profile sync is part of the bug
   - source-plan command surface incidents require a public command regression using the exact planned arguments and must preserve true blocker signals for bad target content
3. Run the selected check in RED mode or document old-behavior proof:
   - preferred: failing test output from the current checkout before the fix
   - acceptable: failing output from the source workspace, prior commit, or fixture replay
   - bypass: only for non-reproducible runtime incidents, with explicit temporary-mitigation label
4. Make the smallest code or contract change needed to pass the active test.
5. Run GREEN and the nearest existing suite before claiming the fix.
6. Keep the test targeted. Do not build a broad scenario runner when one fixture can lock the contract.
7. Report the new test name, command, RED/GREEN evidence, and exact incident class it protects.

MemoryGraph can store the incident summary, taxonomy, test mapping, and recurrence ledger for future recall, but it is not an enforcement gate. The authoritative recurrence guard is the executable regression plus completion-gate evidence.

This is required for structural harness fixes. A change that only improves the symptom without a TDD regression contract is incomplete unless the report explicitly marks it as a temporary mitigation.

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
python3 .claude/skills/moonshot-relay-maintainer/scripts/sync_downstream_claude.py \
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

For harness behavior fixes, also run the new or selected incident regression command and at least one neighboring existing test suite. The report must identify which command is RED/GREEN evidence. Examples:

```bash
node .claude/scripts/agent-loop-phase-state.mjs self-test
node --test .claude/scripts/agent-loop-phase-state.test.mjs
node --test .claude/scripts/agent-loop-phase-runner.test.mjs
node --test .claude/scripts/lib/terminal-blocker-publisher.test.mjs
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
- incident regression added or selected, including RED/GREEN evidence and the command that proves it
- validation commands and pass/fail/skip status
- any pre-existing dirty worktree changes left untouched
