# Phase 02 - Control Plane Registry

```yaml
phaseExecution:
  schemaVersion: 1
  parallelEligible: false
  parallelGroup: workflow-core
  dependsOn:
    - "01-readiness-closeout"
  conflictsWith:
    - "03-state-authority-refactor"
    - "04-evidence-pipeline-split"
    - "05-skill-surface-decomposition"
    - "06-runtime-capability-taxonomy"
  ownedPaths:
    - "docs/implementation/harness-workflow-core-redesign-2026-05-29/execution/staging/phase-02/**"
    - "docs/implementation/harness-workflow-core-redesign-2026-05-29/execution/phase-02/**"
  stagedOwnedPaths:
    - ".claude/workflow.registry.yaml"
    - ".claude/scripts/workflow-registry.mjs"
    - ".claude/scripts/workflow-registry.test.mjs"
    - ".claude/scripts/harness-bottleneck-audit.mjs"
    - ".claude/scripts/harness-bottleneck-audit.test.mjs"
    - ".claude/docs/guidelines/skill-composition.md"
  adoptionTargets:
    - ".claude/workflow.registry.yaml"
    - ".claude/scripts/workflow-registry.mjs"
    - ".claude/scripts/workflow-registry.test.mjs"
    - ".claude/scripts/harness-bottleneck-audit.mjs"
    - ".claude/scripts/harness-bottleneck-audit.test.mjs"
    - ".claude/docs/guidelines/skill-composition.md"
  readOnlyPaths:
    - ".claude/skills/**/SKILL.md"
    - ".codex/skills/**/SKILL.md"
    - ".claude/verification.contract.yaml"
  sharedMutablePaths:
    - "docs/implementation/harness-workflow-core-redesign-2026-05-29/execution/staging/phase-02/**"
  requiresManualEvidence: false
  mergePolicy: sequential_shared_contract
  liveMutationPolicy:
    liveClaudeWrites: prohibited
    stagingRoot: "docs/implementation/harness-workflow-core-redesign-2026-05-29/execution/staging/phase-02"
    adoptionPhase: "08-controlled-harness-adoption"
```

## Objective

Create a workflow registry that becomes the source of truth for public entrypoint metadata, stage order, bundle/profile selection, state authority, verification profile, execution-mode defaults, fallback-mode boundaries, and skill line budgets.

This phase produces a staged overlay only. The `.claude/**` paths above are intended adoption targets, not permission to mutate the live harness during Phase 02.

## AC Mapping

| AC ID | Source | Expected Evidence | Expected Pass Signal |
|---|---|---|---|
| AC-001 | RC1 | Registry file and loader tests | Public entrypoints resolve from registry with stable metadata |
| AC-002 | RC1 | Audit JSON output | `harness-bottleneck-audit.mjs --json` reports registry-derived budgets |
| AC-013 | RC6 | Registry print output and loader tests | `moonshot-phase-runner` resolves `defaultExecutionMode: forked-agent` and `fallbackExecutionMode: delegated-terminal` |
| AC-015 | RC6 | Registry schema and loader tests | Scripts are declared as deterministic helpers; primary orchestration is not script-owned except fallback/headless mode |

## Overlay Execution

All task commands in this phase run with:

```text
HARNESS_OVERLAY_ROOT=docs/implementation/harness-workflow-core-redesign-2026-05-29/execution/staging/phase-02
```

Resolve `.claude/scripts/**` from `HARNESS_OVERLAY_ROOT` first and pass `--overlay-root $HARNESS_OVERLAY_ROOT` to overlay-aware readers. Live `.claude` may be read as baseline only.

## Tasks

| Task | Files / Modules | Commands | Fail Signal | Pass Signal | Evidence Path | Review Checkpoint |
|---|---|---|---|---|---|---|
| T01 | Staged `.claude/workflow.registry.yaml` | `node $HARNESS_OVERLAY_ROOT/.claude/scripts/workflow-registry.mjs --print --overlay-root $HARNESS_OVERLAY_ROOT` | Missing public entrypoint, invalid YAML, missing budget, `moonshot-phase-runner` default is not `forked-agent`, fallback is not `delegated-terminal` | Registry prints `moonshot-phase-runner`, `moonshot-orchestrator`, `product-orchestrator`, `defaultExecutionMode: forked-agent`, `fallbackExecutionMode: delegated-terminal`, and `agentLoopRole: legacy-headless-cron-fallback` | `execution/phase-02/registry-output.json` | Registry must represent existing behavior and the execution-mode pivot before readers switch |
| T02 | Staged `.claude/scripts/workflow-registry.mjs` and test | `node --check $HARNESS_OVERLAY_ROOT/.claude/scripts/workflow-registry.mjs`; `node --test $HARNESS_OVERLAY_ROOT/.claude/scripts/workflow-registry.test.mjs` | Loader throws on valid registry or silently accepts missing execution mode, fallback mode, state authority, verification profile, or deterministic helper boundary | Loader tests pass for valid and invalid cases, including forked-agent default and delegated-terminal fallback requirements | `execution/phase-02/loader-test.txt` | Keep loader read-only and deterministic |
| T03 | Staged `harness-bottleneck-audit.mjs` wiring | `node $HARNESS_OVERLAY_ROOT/.claude/scripts/harness-bottleneck-audit.mjs --json --overlay-root $HARNESS_OVERLAY_ROOT` | Budget source is still hardcoded or registry missing is silent | JSON includes registry budget source and same staged mirror drift semantics | `execution/phase-02/audit-json.txt` | No public skill behavior changes in this phase |
| T04 | Staged `skill-composition.md` registry note | `HARNESS_OVERLAY_ROOT=$HARNESS_OVERLAY_ROOT bash <baseline>/.claude/scripts/knowledge-repo-audit.sh --overlay-root $HARNESS_OVERLAY_ROOT` | Guideline contradicts registry source of truth or treats `agent-loop.mjs` as primary runner | Audit passes against staged guideline or reports unrelated stale-doc warning only | `execution/phase-02/knowledge-audit.txt` | Guideline must point at registry, not duplicate policy |
| T05 | Registry execution boundary fields | `node $HARNESS_OVERLAY_ROOT/.claude/scripts/workflow-registry.mjs --print --overlay-root $HARNESS_OVERLAY_ROOT` | Scripts are allowed to own primary orchestration, retry, or phase decision loops outside fallback/headless mode | Registry output identifies current-session phase-runner as control plane, forked agent as phase attempt owner, parent session as diff/evidence owner, and scripts as deterministic helpers | `execution/phase-02/execution-boundary.json` | Execution boundary must prevent script-loop truth-source drift |

## Blockers

- Registry cannot model current public entrypoint stages without losing an existing hard stop.
- Audit script cannot keep staged mirror drift behavior while reading registry budgets.
- Loader requires runtime state or non-deterministic filesystem mutation.
- Registry cannot express `forked-agent` default plus `delegated-terminal` fallback without preserving headless/cron behavior.
- Registry allows scripts to own primary orchestration decisions outside explicit fallback/headless mode.
- Any required check cannot run against the staged overlay or dry-run mode without mutating live `.claude`.

## Completion Criteria

- Registry, loader, loader tests, and audit wiring are implemented.
- `node --test $HARNESS_OVERLAY_ROOT/.claude/scripts/workflow-registry.test.mjs` passes against the staged overlay.
- Registry output proves `moonshot-phase-runner.defaultExecutionMode` is `forked-agent` and `moonshot-phase-runner.fallbackExecutionMode` is `delegated-terminal`.
- Registry output proves `agent-loop.mjs` is legacy/headless/cron fallback adapter only.
- Registry schema records deterministic script responsibility boundaries.
- `node $HARNESS_OVERLAY_ROOT/.claude/scripts/harness-bottleneck-audit.mjs --json --overlay-root $HARNESS_OVERLAY_ROOT` shows registry-derived budgets.
- Staged overlay manifest lists every proposed `.claude` target and its adoption owner.
- `git diff --check` passes.
