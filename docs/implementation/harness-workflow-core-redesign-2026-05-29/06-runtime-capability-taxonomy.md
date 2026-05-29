# Phase 06 - Runtime Capability Taxonomy

```yaml
phaseExecution:
  schemaVersion: 1
  parallelEligible: false
  parallelGroup: runtime-capability
  dependsOn:
    - "01-readiness-closeout"
    - "02-control-plane-registry"
    - "03-state-authority-refactor"
    - "04-evidence-pipeline-split"
  conflictsWith:
    - "05-skill-surface-decomposition"
  ownedPaths:
    - "docs/implementation/harness-workflow-core-redesign-2026-05-29/execution/staging/phase-06/**"
    - "docs/implementation/harness-workflow-core-redesign-2026-05-29/execution/phase-06/**"
  stagedOwnedPaths:
    - ".claude/scripts/runtime-capability-preflight.mjs"
    - ".claude/scripts/runtime-capability-preflight.test.mjs"
    - ".claude/scripts/workflow-enforcement.mjs"
    - ".claude/scripts/fixtures/runtime-capability/**"
    - ".claude/docs/guidelines/runtime-capability-taxonomy.md"
  adoptionTargets:
    - ".claude/scripts/runtime-capability-preflight.mjs"
    - ".claude/scripts/runtime-capability-preflight.test.mjs"
    - ".claude/scripts/workflow-enforcement.mjs"
    - ".claude/scripts/fixtures/runtime-capability/**"
    - ".claude/docs/guidelines/runtime-capability-taxonomy.md"
  readOnlyPaths:
    - ".claude/workflow.registry.yaml"
    - ".claude/verification.contract.yaml"
    - ".claude/skills/**/SKILL.md"
    - "docs/implementation/**"
  sharedMutablePaths:
    - "docs/implementation/harness-workflow-core-redesign-2026-05-29/execution/staging/phase-06/**"
  requiresManualEvidence: false
  mergePolicy: sequential_shared_contract
  liveMutationPolicy:
    liveClaudeWrites: prohibited
    stagingRoot: "docs/implementation/harness-workflow-core-redesign-2026-05-29/execution/staging/phase-06"
    adoptionPhase: "08-controlled-harness-adoption"
```

## Objective

Make runtime and host failures first-class typed outcomes so MemoryGraph transport, browser backend, shell fallback, worktree, and MCP/tool lookup failures do not masquerade as product failures or block unrelated closeout.

This phase produces a staged overlay only. The `.claude/**` paths above are intended adoption targets, not permission to mutate the live harness during Phase 06.

## AC Mapping

| AC ID | Source | Expected Evidence | Expected Pass Signal |
|---|---|---|---|
| AC-009 | RC4 | Failure taxonomy schema and tests | Failures classify as `product_failure`, `harness_contract_failure`, `runtime_capability_failure`, or `host_environment_failure` |
| AC-010 | RC4 | Capability preflight output | Preflight emits fallback/degraded policy and blocks only contract-required evidence |

## Overlay Execution

All task commands in this phase run with:

```text
HARNESS_OVERLAY_ROOT=docs/implementation/harness-workflow-core-redesign-2026-05-29/execution/staging/phase-06
```

Resolve staged `.claude/scripts/**` and `.claude/docs/guidelines/**` from `HARNESS_OVERLAY_ROOT` first and pass `--overlay-root $HARNESS_OVERLAY_ROOT` to capability and workflow verification commands.

## Tasks

| Task | Files / Modules | Commands | Fail Signal | Pass Signal | Evidence Path | Review Checkpoint |
|---|---|---|---|---|---|---|
| T01 | Staged taxonomy and preflight module | `node --check $HARNESS_OVERLAY_ROOT/.claude/scripts/runtime-capability-preflight.mjs`; `node --test $HARNESS_OVERLAY_ROOT/.claude/scripts/runtime-capability-preflight.test.mjs` | Failure type missing or product failure used for runtime outage | Typed classification is emitted for each fixture | `execution/phase-06/preflight-test.txt` | Keep taxonomy closed and documented |
| T02 | Staged MemoryGraph fallback fixture | `node --test $HARNESS_OVERLAY_ROOT/.claude/scripts/runtime-capability-preflight.test.mjs --test-name-pattern MemoryGraph --overlay-root $HARNESS_OVERLAY_ROOT` | `Transport closed` blocks unrelated Git/verification closeout | MemoryGraph failure emits degraded memory policy only | `execution/phase-06/memorygraph-fallback.txt` | Explicit memory persistence requests may still block |
| T03 | Staged Windows shell fallback fixture | `node --test $HARNESS_OVERLAY_ROOT/.claude/scripts/runtime-capability-preflight.test.mjs --test-name-pattern Windows --overlay-root $HARNESS_OVERLAY_ROOT` | `rg.exe` or shell issue becomes product failure | Host issue emits command fallback guidance | `execution/phase-06/windows-fallback.txt` | Do not hide real source/test failures |
| T04 | Staged browser capability fixture | `node --test $HARNESS_OVERLAY_ROOT/.claude/scripts/runtime-capability-preflight.test.mjs --test-name-pattern browser --overlay-root $HARNESS_OVERLAY_ROOT` | Missing browser blocks non-browser work | Browser missing blocks only browser-required evidence | `execution/phase-06/browser-capability.txt` | Browser evidence requirements come from registry/profile |
| T05 | Staged workflow enforcement integration | `node $HARNESS_OVERLAY_ROOT/.claude/scripts/workflow-enforcement.mjs verify --overlay-root $HARNESS_OVERLAY_ROOT` | Verify output lacks capability classification | Verify output includes typed capability state | `execution/phase-06/workflow-verify.txt` | Integration must not weaken strict product gates |

## Blockers

- Existing verification contract has no way to distinguish capability and product failures.
- Capability fallback would skip evidence that the active profile explicitly requires.
- Runtime taxonomy conflicts with state board terminal decision semantics.
- Any required check cannot run against the staged overlay or dry-run mode without mutating live `.claude`.

## Completion Criteria

- Capability preflight tests pass.
- Runtime/host failures are typed and routed through fallback/degraded policy.
- Product failures remain strict product failures.
- Workflow verification exposes capability state without weakening AC/SCN evidence gates.
- Staged overlay manifest lists every proposed `.claude` target and its adoption owner.
