# Phase 08 - Controlled Harness Adoption

```yaml
phaseExecution:
  schemaVersion: 1
  parallelEligible: false
  parallelGroup: adoption
  dependsOn:
    - "01-readiness-closeout"
    - "02-control-plane-registry"
    - "03-state-authority-refactor"
    - "04-evidence-pipeline-split"
    - "05-skill-surface-decomposition"
    - "06-runtime-capability-taxonomy"
    - "07-cross-surface-propagation"
  conflictsWith: []
  ownedPaths:
    - "docs/implementation/harness-workflow-core-redesign-2026-05-29/execution/tooling/harness-adoption-plan.mjs"
    - "docs/implementation/harness-workflow-core-redesign-2026-05-29/execution/tooling/harness-adoption-plan.test.mjs"
    - ".claude/workflow.registry.yaml"
    - ".claude/scripts/**"
    - ".claude/skills/**"
    - ".codex/skills/**"
    - ".claude/agents/**"
    - ".claude/docs/guidelines/**"
    - ".claude/verification.contract.yaml"
  readOnlyPaths:
    - "docs/implementation/harness-workflow-core-redesign-2026-05-29/**"
    - "docs/implementation/harness-workflow-core-redesign-2026-05-29/execution/staging/**"
  sharedMutablePaths:
    - ".claude/**"
    - ".codex/skills/**"
  requiresManualEvidence: false
  mergePolicy: single_adoption_batch
  liveMutationPolicy:
    liveClaudeWrites: allowed
    liveCodexWrites: allowed
    adoptionSourceRoot: "docs/implementation/harness-workflow-core-redesign-2026-05-29/execution/staging"
```

## Objective

Adopt the staged overlays from Phase 02-07 into live `.claude/**` and `.codex/**` as one coherent harness change set, then prove the resulting live harness passes global verification.

The adoption runner is a plan-package bootstrap tool under `docs/implementation/harness-workflow-core-redesign-2026-05-29/execution/tooling/`. It must be executable before any staged `.claude/scripts` overlay is adopted.

## AC Mapping

| AC ID | Source | Expected Evidence | Expected Pass Signal |
|---|---|---|---|
| AC-018 | RC8 | Staging manifest check | Every Phase 02-07 overlay has owner, proposed live targets, verification evidence, and conflict classification |
| AC-019 | RC8 | Adoption manifest and post-adoption verification | Live `.claude`/`.codex` reflects one approved adoption batch and strict global checks pass |

## Tasks

| Task | Surface | Command | Expected Fail Signal | Expected Pass Signal | Evidence Path | Blocker |
|---|---|---|---|---|---|---|
| T01 | Staging inventory | `node docs/implementation/harness-workflow-core-redesign-2026-05-29/execution/tooling/harness-adoption-plan.mjs --check-staging --staging-root docs/implementation/harness-workflow-core-redesign-2026-05-29/execution/staging` | Missing manifest, unknown owner, missing target, or missing phase evidence | JSON lists all staged overlays and no unresolved target conflicts | `execution/phase-08/staging-inventory.json` | Any Phase 02-07 overlay lacks owner or evidence |
| T02 | Adoption dry-run | `node docs/implementation/harness-workflow-core-redesign-2026-05-29/execution/tooling/harness-adoption-plan.mjs --dry-run --staging-root docs/implementation/harness-workflow-core-redesign-2026-05-29/execution/staging` | Partial batch, target collision, mirror mismatch, or unreviewed exception | Dry-run prints deterministic adoption plan with rollback list | `execution/phase-08/adoption-dry-run.txt` | Any live target would be overwritten without explicit staged owner |
| T03 | Live adoption | `node docs/implementation/harness-workflow-core-redesign-2026-05-29/execution/tooling/harness-adoption-plan.mjs --apply --staging-root docs/implementation/harness-workflow-core-redesign-2026-05-29/execution/staging` | Apply changes outside manifest or leaves partial write | Adoption manifest records exact live files changed and rollback inputs | `execution/phase-08/adoption-manifest.json` | Apply command cannot prove atomic enough recovery semantics |
| T04 | Post-adoption global verification | `node .claude/scripts/harness-bottleneck-audit.mjs --json`; `bash .claude/scripts/verify-phase-runner-boundary.sh`; `bash .claude/scripts/knowledge-repo-audit.sh`; `git diff --check` | Mirror drift, boundary failure, knowledge audit error, or whitespace error | Strict checks pass or report only pre-existing stale-doc warning | `execution/phase-08/post-adoption-verification.md` | Any global check fails because of adopted changes |
| T05 | Runtime pointer safety | `node .claude/scripts/workflow-enforcement.mjs status --json` | Status points at stale pre-adoption state or script-owned primary loop | Status reflects registry/state-board contract and no stale adoption warning | `execution/phase-08/runtime-pointer-check.json` | Runtime state cannot identify the adopted contract version |

## Adoption Rules

- Phase 08 is the only phase that may write to live `.claude/**` or `.codex/**`.
- The adoption runner must run from the plan-package tooling path, not from a staged `.claude/scripts` path.
- Apply staged overlays as one adoption batch. Do not cherry-pick individual phase changes unless the manifest records a scoped exception.
- Do not adopt if Phase 07 propagation parity has unresolved surfaces.
- Do not adopt if `.codex/skills` mirror changes are missing for any changed `.claude/skills` entry.
- Do not relax strict verification to make adoption pass. A failed global check reopens the producing phase or blocks adoption.

## Blockers

- Any Phase 02-07 staged manifest is missing, unowned, or unverifiable.
- Any staged overlay targets live `.claude` or `.codex` paths outside the approved surface inventory.
- Any target collision cannot be resolved without changing the contract design.
- Post-adoption verification fails because of adopted changes.
- Rollback inputs cannot be reconstructed from the adoption manifest.

## Completion Criteria

- `harness-adoption-plan.mjs --check-staging` passes.
- Adoption dry-run produces a deterministic apply plan and rollback list.
- Live adoption manifest records every changed `.claude` and `.codex` path.
- Post-adoption `harness-bottleneck-audit`, boundary verification, knowledge audit, and whitespace checks pass.
- Runtime status reports the adopted forked-agent/control-plane/state/evidence contract without stale primary-loop warnings.
