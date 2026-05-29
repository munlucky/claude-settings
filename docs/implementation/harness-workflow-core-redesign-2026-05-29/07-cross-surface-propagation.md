# Phase 07 - Cross-Surface Propagation

```yaml
phaseExecution:
  id: "07-cross-surface-propagation"
  parallelEligible: false
  parallelGroup: propagation
  dependsOn:
    - "01-readiness-closeout"
    - "02-control-plane-registry"
    - "03-state-authority-refactor"
    - "04-evidence-pipeline-split"
    - "05-skill-surface-decomposition"
    - "06-runtime-capability-taxonomy"
  conflictsWith: []
  ownedPaths:
    - "docs/implementation/harness-workflow-core-redesign-2026-05-29/execution/staging/phase-07/**"
    - "docs/implementation/harness-workflow-core-redesign-2026-05-29/execution/phase-07/**"
  stagedOwnedPaths:
    - ".claude/scripts/harness-surface-inventory.mjs"
    - ".claude/scripts/harness-surface-inventory.test.mjs"
    - ".claude/scripts/harness-propagation-parity.mjs"
    - ".claude/scripts/harness-propagation-parity.test.mjs"
    - ".claude/workflow.registry.yaml"
    - ".claude/skills/**/SKILL.md"
    - ".codex/skills/**/SKILL.md"
    - ".claude/agents/**/*.md"
    - ".claude/docs/guidelines/**"
    - ".claude/verification.contract.yaml"
  adoptionTargets:
    - ".claude/scripts/harness-surface-inventory.mjs"
    - ".claude/scripts/harness-surface-inventory.test.mjs"
    - ".claude/scripts/harness-propagation-parity.mjs"
    - ".claude/scripts/harness-propagation-parity.test.mjs"
    - ".claude/workflow.registry.yaml"
    - ".claude/skills/**/SKILL.md"
    - ".codex/skills/**/SKILL.md"
    - ".claude/agents/**/*.md"
    - ".claude/docs/guidelines/**"
    - ".claude/verification.contract.yaml"
  readOnlyPaths:
    - ".claude/rules/**"
    - ".claude/scripts/**"
    - "install-claude.sh"
    - "docs/implementation/**"
  sharedMutablePaths:
    - "docs/implementation/harness-workflow-core-redesign-2026-05-29/execution/staging/phase-07/**"
  requiresManualEvidence: false
  mergePolicy: sequential_global_contract
  liveMutationPolicy:
    liveClaudeWrites: prohibited
    liveCodexWrites: prohibited
    stagingRoot: "docs/implementation/harness-workflow-core-redesign-2026-05-29/execution/staging/phase-07"
    adoptionPhase: "08-controlled-harness-adoption"
```

## Objective

Stage the redesigned contract across every harness workflow surface, not only the phase runner.

This phase produces a staged overlay and propagation manifest only. The `.claude/**` and `.codex/**` paths above are intended adoption targets, not permission to mutate the live harness during Phase 07.

The target contract:
- current-session control plane owns cross-phase decisions
- forked-agent execution is the default where interactive agent runtime exists
- `delegated-terminal` and `agent-loop.mjs` are fallback/headless/cron adapters
- scripts are deterministic helpers, not primary orchestration owners
- state board and evidence router are the source for status and completion semantics
- skills and agents expose local role contracts and defer shared policy to registry/guidelines

## AC Mapping

| AC ID | Source | Expected Evidence | Expected Pass Signal |
|---|---|---|---|
| AC-016 | RC7 | Staged `harness-surface-inventory.mjs --json` output | Every workflow, skill, agent, command adapter, verification contract, and mirror surface is classified with owner, role, and contract status in the overlay |
| AC-017 | RC7 | Staged `harness-propagation-parity.mjs --json` output | No stale primary `delegated-terminal`, primary `agent-loop`, script-owned primary loop, unclassified agent, or staged mirror drift remains outside explicit exceptions |

## Overlay Execution

All task commands in this phase run with:

```text
HARNESS_OVERLAY_ROOT=docs/implementation/harness-workflow-core-redesign-2026-05-29/execution/staging/phase-07
```

Resolve staged `.claude/**` and `.codex/skills/**` from `HARNESS_OVERLAY_ROOT` first. Inventory and parity commands must report staged surfaces. Live mirror parity is verified only after Phase 08 adoption.

## Surface Inventory Scope

Required inventory groups:

| Group | Paths | Required Classification |
|---|---|---|
| Public workflow entrypoints | `.claude/skills/product-orchestrator`, `.claude/skills/moonshot-phase-runner`, `.claude/skills/moonshot-orchestrator` | `public_entrypoint` |
| Utility entrypoints | `.claude/skills/session-logger`, `.claude/skills/commit-moonshot` | `public_utility` |
| Internal stage-owner skills | `.claude/skills/**/SKILL.md` excluding public entrypoints/utilities | `internal_stage_owner` or `optional_bundle_member` |
| Codex mirrors | `.codex/skills/**/SKILL.md` | `mirror_of_claude_skill` |
| Agent definitions | `.claude/agents/**/*.md` | `agent_contract` |
| Command adapters | `.claude/scripts/*.mjs`, `.claude/scripts/*.sh`, `.claude/agents/verification/*.sh`, `install-claude.sh` | `deterministic_helper` or explicit `fallback_adapter` |
| Workflow docs/contracts | `.claude/docs/guidelines/**`, `.claude/verification.contract.yaml`, `.claude/workflow.registry.yaml` | `contract_source` |

## Tasks

| Task | Surface | Command | Expected Fail Signal | Expected Pass Signal | Evidence Path | Blocker |
|---|---|---|---|---|---|---|
| T01 | Staged inventory generator | `node --check $HARNESS_OVERLAY_ROOT/.claude/scripts/harness-surface-inventory.mjs`; `node --test $HARNESS_OVERLAY_ROOT/.claude/scripts/harness-surface-inventory.test.mjs` | Missing path group, duplicate owner, unclassified skill/agent/script | JSON lists every required group with owner and role in the overlay | `execution/phase-07/surface-inventory.json` | Inventory omits any existing public entrypoint, agent, or command adapter |
| T02 | Staged propagation parity | `node --check $HARNESS_OVERLAY_ROOT/.claude/scripts/harness-propagation-parity.mjs`; `node --test $HARNESS_OVERLAY_ROOT/.claude/scripts/harness-propagation-parity.test.mjs` | Stale `delegated-terminal` primary default, primary `agent-loop`, script-owned orchestration loop, or unclassified exception | JSON reports `verdict: passed` with explicit exception list only | `execution/phase-07/propagation-parity.json` | Any stale primary runner semantics remain outside approved fallback/headless exception |
| T03 | Staged skill and Codex mirror parity | `node $HARNESS_OVERLAY_ROOT/.claude/scripts/harness-bottleneck-audit.mjs --json --overlay-root $HARNESS_OVERLAY_ROOT` | Staged `.codex/skills` mirror drift non-zero or public entrypoint metadata missing | Staged mirror drift is `0`; public entrypoints map to registry roles | `execution/phase-07/skill-mirror-parity.json` | Staged mirror drift or missing entrypoint role |
| T04 | Staged agent contract propagation | `node $HARNESS_OVERLAY_ROOT/.claude/scripts/harness-surface-inventory.mjs --json --overlay-root $HARNESS_OVERLAY_ROOT` | Any staged `.claude/agents/**/*.md` lacks role, allowed write/read scope, or runtime dependency classification | Every agent is classified as `agent_contract` with forked-agent compatibility or explicit exception | `execution/phase-07/agent-contracts.json` | Any agent can still imply script-owned primary loop without exception |
| T05 | Staged workflow contract verification | `HARNESS_OVERLAY_ROOT=$HARNESS_OVERLAY_ROOT bash <baseline>/.claude/scripts/verify-phase-runner-boundary.sh --overlay-root $HARNESS_OVERLAY_ROOT`; `HARNESS_OVERLAY_ROOT=$HARNESS_OVERLAY_ROOT bash <baseline>/.claude/scripts/knowledge-repo-audit.sh --overlay-root $HARNESS_OVERLAY_ROOT`; `git diff --check` | Boundary, knowledge, or whitespace check fails against overlay | Checks pass against overlay or report only pre-existing stale-doc warning | `execution/phase-07/verification.md` | Boundary check failure or knowledge audit error |

## Propagation Rules

- Do not update only `moonshot-phase-runner`; every public entrypoint must either adopt the registry contract or record a concrete exception.
- Do not leave agent definitions implicit. Each agent must declare whether it is a forked phase attempt, read-only reviewer, writer, verifier, memory helper, documentation helper, or fallback adapter.
- Do not let scripts become hidden orchestrators. A script may compute status, validate registry, run tests, write finalizer output, or support fallback/headless execution only when registry selects fallback mode.
- Do not treat staged `.codex/skills` as optional. Mirrors must remain synchronized with staged `.claude/skills` for every changed skill.
- Do not weaken existing strict verification. Propagation adds coverage; it must not relax AC/SCN/evidence gates.
- Do not apply partial propagation directly to live `.claude` or `.codex`; Phase 07 only proves the propagation set is complete enough for Phase 08 adoption.

## Blockers

- Any harness workflow entrypoint cannot be represented in `.claude/workflow.registry.yaml`.
- Any agent definition cannot be classified without changing its intended role.
- Any command adapter currently owns primary orchestration semantics and cannot be safely demoted or exception-listed.
- Any staged Codex mirror drift remains after skill updates.
- Any propagation parity exception is broad enough to hide stale `delegated-terminal` primary semantics.
- Any required check cannot run against the staged overlay or dry-run mode without mutating live `.claude` or `.codex`.

## Completion Criteria

- `harness-surface-inventory.mjs --json` covers all required groups.
- `harness-propagation-parity.mjs --json` passes with no unclassified surfaces.
- Every approved exception is named, scoped, and linked to fallback/headless/cron use.
- Staged `.codex/skills` mirror drift is `0`.
- `verify-phase-runner-boundary.sh`, `knowledge-repo-audit.sh`, and `git diff --check` pass.
- Staged propagation manifest lists every proposed `.claude` and `.codex` target and its adoption owner.
