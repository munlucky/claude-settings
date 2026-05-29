# Phase 05 - Skill Surface Decomposition

```yaml
phaseExecution:
  schemaVersion: 1
  parallelEligible: false
  parallelGroup: skill-surface
  dependsOn:
    - "01-readiness-closeout"
    - "02-control-plane-registry"
    - "04-evidence-pipeline-split"
  conflictsWith:
    - "03-state-authority-refactor"
    - "06-runtime-capability-taxonomy"
  ownedPaths:
    - "docs/implementation/harness-workflow-core-redesign-2026-05-29/execution/staging/phase-05/**"
    - "docs/implementation/harness-workflow-core-redesign-2026-05-29/execution/phase-05/**"
  stagedOwnedPaths:
    - ".claude/skills/moonshot-phase-runner/SKILL.md"
    - ".claude/skills/moonshot-orchestrator/SKILL.md"
    - ".claude/skills/moonshot-plan-writer/SKILL.md"
    - ".claude/skills/completion-verifier/SKILL.md"
    - ".claude/skills/moonshot-teams-runner/SKILL.md"
    - ".claude/skills/**/references/**"
    - ".codex/skills/moonshot-phase-runner/SKILL.md"
    - ".codex/skills/moonshot-orchestrator/SKILL.md"
    - ".codex/skills/moonshot-plan-writer/SKILL.md"
    - ".codex/skills/completion-verifier/SKILL.md"
    - ".codex/skills/moonshot-teams-runner/SKILL.md"
  adoptionTargets:
    - ".claude/skills/moonshot-phase-runner/SKILL.md"
    - ".claude/skills/moonshot-orchestrator/SKILL.md"
    - ".claude/skills/moonshot-plan-writer/SKILL.md"
    - ".claude/skills/completion-verifier/SKILL.md"
    - ".claude/skills/moonshot-teams-runner/SKILL.md"
    - ".claude/skills/**/references/**"
    - ".codex/skills/moonshot-phase-runner/SKILL.md"
    - ".codex/skills/moonshot-orchestrator/SKILL.md"
    - ".codex/skills/moonshot-plan-writer/SKILL.md"
    - ".codex/skills/completion-verifier/SKILL.md"
    - ".codex/skills/moonshot-teams-runner/SKILL.md"
  readOnlyPaths:
    - ".claude/workflow.registry.yaml"
    - ".claude/scripts/harness-bottleneck-audit.mjs"
    - ".claude/docs/guidelines/skill-composition.md"
  sharedMutablePaths:
    - "docs/implementation/harness-workflow-core-redesign-2026-05-29/execution/staging/phase-05/**"
  requiresManualEvidence: false
  mergePolicy: sequential_skill_mirror
  liveMutationPolicy:
    liveClaudeWrites: prohibited
    liveCodexWrites: prohibited
    stagingRoot: "docs/implementation/harness-workflow-core-redesign-2026-05-29/execution/staging/phase-05"
    adoptionPhase: "08-controlled-harness-adoption"
```

## Objective

Reduce high-load skill entrypoints by moving non-trigger control-plane policy, examples, incident taxonomy, and long command matrices into registry-backed references while preserving hard stops and output contracts.

This phase produces a staged overlay only. The `.claude/**` and `.codex/**` paths above are intended adoption targets, not permission to mutate the live harness during Phase 05.

## AC Mapping

| AC ID | Source | Expected Evidence | Expected Pass Signal |
|---|---|---|---|
| AC-007 | RC1 | Updated skill frontmatter and reference layout | Public entrypoints expose trigger contract plus `deepReferences` metadata |
| AC-008 | RC1 | Staged audit output and staged mirror drift check | Over-budget count drops in the overlay and staged `.codex/skills` mirror drift remains `0` |

## Overlay Execution

All task commands in this phase run with:

```text
HARNESS_OVERLAY_ROOT=docs/implementation/harness-workflow-core-redesign-2026-05-29/execution/staging/phase-05
```

Resolve staged `.claude/skills/**` and `.codex/skills/**` from `HARNESS_OVERLAY_ROOT` first. Mirror checks in this phase are staged mirror checks only; live mirror parity is verified after Phase 08 adoption.

## Tasks

| Task | Files / Modules | Commands | Fail Signal | Pass Signal | Evidence Path | Review Checkpoint |
|---|---|---|---|---|---|---|
| T01 | Staged `moonshot-phase-runner` decomposition | `node $HARNESS_OVERLAY_ROOT/.claude/scripts/harness-bottleneck-audit.mjs --json --overlay-root $HARNESS_OVERLAY_ROOT` | Hard stop removed, entrypoint still over budget without exception | Entrypoint budget improves in staging and references preserve moved policy | `execution/phase-05/phase-runner-surface.txt` | Diff must show moved policy has a reference target |
| T02 | Staged `moonshot-orchestrator` decomposition | `node $HARNESS_OVERLAY_ROOT/.claude/scripts/harness-bottleneck-audit.mjs --json --overlay-root $HARNESS_OVERLAY_ROOT` | Routing contract changes or policy disappears | Budget improves in staging; registry still owns stage/bundle policy | `execution/phase-05/orchestrator-surface.txt` | Do not refactor unrelated skill behavior |
| T03 | Staged `moonshot-plan-writer` decomposition | `node $HARNESS_OVERLAY_ROOT/.claude/scripts/harness-bottleneck-audit.mjs --json --overlay-root $HARNESS_OVERLAY_ROOT` | Independent Planning Loop loses boundary rules | Entrypoint budget improves in staging; loop contract remains referenced and testable | `execution/phase-05/plan-writer-surface.txt` | Preserve child-agent denylist semantics |
| T04 | Staged `completion-verifier` and `moonshot-teams-runner` pass | `HARNESS_OVERLAY_ROOT=$HARNESS_OVERLAY_ROOT bash <baseline>/.claude/scripts/verify-phase-runner-boundary.sh --overlay-root $HARNESS_OVERLAY_ROOT` | Boundary or verification contract breaks | Boundary verification passes against staged skills | `execution/phase-05/boundary-check.txt` | Only decompose after public entrypoints are stable |
| T05 | Staged mirror drift check | `node $HARNESS_OVERLAY_ROOT/.claude/scripts/harness-bottleneck-audit.mjs --json --overlay-root $HARNESS_OVERLAY_ROOT` | Staged `.codex/skills` mirror drift non-zero | Staged mirror drift is `0` | `execution/phase-05/mirror-drift.txt` | Mirror overlay must be updated in same phase |

## Blockers

- Any skill policy cannot be safely moved without a stable registry/reference target.
- Staged `.codex/skills` mirror cannot be updated consistently.
- A behavior or boundary test fails after decomposition.
- Any required check cannot run against the staged overlay or dry-run mode without mutating live `.claude` or `.codex`.

## Completion Criteria

- The top over-budget skills have lower line counts or documented exceptions.
- Hard stops, routing inputs, and output artifacts remain visible in entrypoints.
- Deep references contain moved policy.
- Staged mirror drift remains zero and boundary tests pass against the overlay.
- Staged overlay manifest lists every proposed `.claude` and `.codex` target and its adoption owner.
