# Harness Workflow Core Redesign Master Plan

Last-Reviewed: 2026-05-29
ReadinessDecision: runner_prepared

## Goal

현재 Moonshot 하네스의 병목을 `SKILL.md` 줄 수 축소가 아니라 **workflow control plane 재설계**로 해결한다.

성공 기준:
- 스킬은 trigger-time contract만 담고, 실행 로직과 긴 정책은 registry/reference/script로 이동한다.
- phase 실행 상태의 권위가 `phase-status.yaml`, runtime SQLite, verifier verdict 사이에서 충돌하지 않는다.
- 검증 smoke, closeout scorecard, runtime adapter parity가 서로 다른 목적의 gate로 분리된다.
- Windows host failure, MemoryGraph transport failure, tool unavailable이 제품/하네스 실패로 오분류되지 않는다.
- Codex/Claude runtime 모두 같은 workflow contract를 읽고, adapter만 다르게 동작한다.
- 개선된 실행/상태/검증 계약이 일부 entrypoint에 머물지 않고 모든 harness workflow, skill, agent surface에 전파된다.
- Phase별 산출물은 staged overlay에서 검증하고, live `.claude`/`.codex` 반영은 단일 controlled adoption phase에서만 수행된다.

## Evidence Baseline

`node .claude/scripts/harness-bottleneck-audit.mjs --json` 기준:
- 스킬 51개 중 19개가 line budget 초과
- public entrypoint 초과: `moonshot-orchestrator` 601 lines, `moonshot-phase-runner` 511 lines, `product-orchestrator` 217 lines
- local Codex memory evidence: 751 hits
- 상위 반복 병목: closeout hygiene 375, verification evidence 311, state authority 141, skill surface 102, MemoryGraph transport 100, Windows host 68, runtime continuation 67
- `.codex/skills` mirror drift: 0

## Root Causes

| Root Cause | Summary | Target AC |
|---|---|---|
| RC1 | Skill files carry control-plane logic: trigger, routing, state transition, command matrix, incident memory, runtime policy. | AC-001, AC-002, AC-007, AC-008 |
| RC2 | State authority is split across human docs and machine projections. | AC-003, AC-004, AC-014 |
| RC3 | Verification gates are overloaded and conflate adapter, closeout, and product acceptance evidence. | AC-005, AC-006 |
| RC4 | Runtime capability failures are not first-class and are misclassified as product failures. | AC-009, AC-010 |
| RC5 | Current plan package is not runner-prepared because phase docs, dirty-path classification, and runtime pointer preparation are absent. | AC-011, AC-012 |
| RC6 | The old script loop exists to bypass small context windows; current forked-agent execution can replace it as the default path. | AC-013, AC-014, AC-015 |
| RC7 | Improvements can remain local to phase-runner unless every workflow, skill, agent, command adapter, and mirror surface has an explicit propagation inventory and parity gate. | AC-016, AC-017 |
| RC8 | Applying each phase directly into live `.claude` would mutate the running harness while its contracts are still inconsistent. | AC-018, AC-019 |

## Target Architecture

```text
User Request
  -> Entry Skill Contract
  -> Workflow Registry
  -> Runtime Capability Preflight
  -> Current-Session Phase Runner Control Plane
  -> Forked Agent Phase Attempt
  -> Parent-Owned Diff/Evidence Collection
  -> State Board
  -> Evidence Router
  -> Closeout Finalizer
  -> Controlled Harness Adoption
```

### Entry Skill Contract

Public entrypoints stay stable:
- `product-orchestrator`
- `moonshot-phase-runner`
- `moonshot-orchestrator`

Each public `SKILL.md` must fit:
- trigger rules
- handoff/routing decision
- required input references
- hard stop conditions
- output artifact contract

Everything else moves out.

### Workflow Registry

Add a source-owned registry, for example:

```yaml
entrypoints:
  moonshot-phase-runner:
    profile: phase
    stages: [intake, plan, ready, execute, review, verify, finish]
    defaultExecutionMode: forked-agent
    fallbackExecutionMode: delegated-terminal
    stateAuthority: phase-runtime-read-model
    verificationProfile: workflow_core
    executionBoundary:
      controlPlaneOwner: current-session-phase-runner
      phaseAttemptOwner: forked-agent
      diffAndEvidenceOwner: parent-session
      agentLoopRole: legacy-headless-cron-fallback
```

This replaces repeated bundle lists embedded in skills.

Execution topology:
- The current session keeps control-plane responsibility: select the phase, spawn the forked attempt, collect diff/evidence, run deterministic verifier/finalizer helpers, and decide the next action from the state board.
- Forked agents execute one prepared phase packet and return structured results. They do not own cross-phase retry policy, terminal closeout, runtime pointer rewrites, or next-phase selection.
- `delegated-terminal` is a fallback mode for environments without forked-agent runtime, non-interactive headless runs, or cron-style execution.
- `agent-loop.mjs` is legacy/headless/cron fallback adapter only. It must not be treated as the primary runner when forked-agent execution is available.

Script boundary:
- Scripts may load/validate registry state, produce status JSON, classify evidence, run verifiers, finalize closeout, and materialize deterministic readiness checks.
- Scripts must not own the primary agent orchestration loop, cross-phase retry policy, or phase decision loop except inside explicitly selected fallback/headless mode.

### Staged Harness Adoption Boundary

Implementation phases 02-07 are **staged-change phases**, not live harness mutation phases.

Path semantics:
- Phase 02-07 `ownedPaths` may contain only staging/evidence paths.
- Phase 02-07 `stagedOwnedPaths` name paths inside the overlay that the phase may create or modify.
- Phase 02-07 `adoptionTargets` name the eventual live `.claude/**` and `.codex/**` targets for Phase 08.
- Staged overlays may mirror `.claude/**` and `.codex/**`, but they do not replace the live harness during the producing phase.
- Validation during Phase 02-07 must run against the staged overlay, fixture copy, or explicit dry-run mode. If a command cannot run without live mutation, that is a blocker for the phase.
- Phase 08 is the only phase allowed to copy/adopt staged changes into live `.claude/**` and `.codex/**`.
- Phase 08 must apply staged changes as one coherent adoption set, then run global verification and mirror parity before declaring completion.

Overlay execution rule:
- Any Phase 02-07 command that names `.claude/scripts/**`, `.claude/skills/**`, `.codex/skills/**`, or `.claude/agents/**` is a logical command.
- The runner must resolve staged files from `HARNESS_OVERLAY_ROOT` first and pass `--overlay-root <phase-staging-root>` to overlay-aware readers.
- A phase must not satisfy verification by reading only the live harness when the changed file exists only in staging.
- Bootstrap helpers required before adoption must live under `docs/implementation/harness-workflow-core-redesign-2026-05-29/execution/tooling/`, not only inside a staged `.claude/scripts` overlay.
- Each Phase 02-07 overlay is cumulative: it includes all approved earlier staged overlays plus the current phase changes.

### State Board

One compact read model owns current execution truth:
- active plan dir
- active phase
- active execution status
- latest dispatch id
- latest run id
- latest verifier verdict id
- stale warnings
- next valid action

Human docs can render this state, but they do not compute it independently.

### Evidence Router

Evidence classes:
- `adapter_smoke`
- `contract_verification`
- `product_acceptance`
- `runtime_capability`
- `host_environment`
- `closeout_scope`

Each verifier command must declare which evidence class it produces. No command should satisfy a class by implication.

### Skill Surface Manager

Maintain machine-readable skill metadata:
- `surfaceStatus`
- `lineBudget`
- `deepReferences`
- `outputArtifacts`
- `runtimeCapabilities`

`harness-bottleneck-audit.mjs` becomes a reporting input, not the only policy source.

## Non-Goals

- Do not create a new public orchestrator.
- Do not remove strict verification gates.
- Do not hide missing verification under "simplification".
- Do not migrate all human artifacts into SQLite.
- Do not rewrite every skill in one batch.
- Do not dispatch implementation phases before readiness closeout has classified dirty paths and runtime pointers.
- Do not apply phase-by-phase partial edits directly into live `.claude` or `.codex`.

## Plan Package Readiness Closeout

```yaml
planPackageReadiness:
  mode: prep_phase_required
  selectedMasterPlan: docs/implementation/harness-workflow-core-redesign-2026-05-29/00-master-plan-v1.md
  selectedPhaseDocs:
    - docs/implementation/harness-workflow-core-redesign-2026-05-29/01-readiness-closeout.md
    - docs/implementation/harness-workflow-core-redesign-2026-05-29/02-control-plane-registry.md
    - docs/implementation/harness-workflow-core-redesign-2026-05-29/03-state-authority-refactor.md
    - docs/implementation/harness-workflow-core-redesign-2026-05-29/04-evidence-pipeline-split.md
    - docs/implementation/harness-workflow-core-redesign-2026-05-29/05-skill-surface-decomposition.md
    - docs/implementation/harness-workflow-core-redesign-2026-05-29/06-runtime-capability-taxonomy.md
    - docs/implementation/harness-workflow-core-redesign-2026-05-29/07-cross-surface-propagation.md
    - docs/implementation/harness-workflow-core-redesign-2026-05-29/08-controlled-harness-adoption.md
  staleRootPhaseDocs: []
  staleMasterPlans: []
  dirtyWorktreeAction: classify_before_edit
  runtimePointerAction: archive_before_dispatch
  dryRunCommand: >-
    node .claude/scripts/prepare-implementation-plan-state.mjs --dry-run
    --plan-dir docs/implementation/harness-workflow-core-redesign-2026-05-29
    --master-plan docs/implementation/harness-workflow-core-redesign-2026-05-29/00-master-plan-v1.md
    --status-file .claude/docs/phase-status.yaml
    --execution-root docs/implementation/harness-workflow-core-redesign-2026-05-29/execution
    --archive-label harness-workflow-core-redesign-2026-05-29
  readinessDecision: runner_prepared
```

Rationale:
- Writer Agent cannot run git commands, mutate runtime state, or archive runtime pointers.
- Reviewer reported a dirty worktree; every current path must be classified before source or runtime edits.
- `docs/implementation/execution` exists and must be treated as possible stale runtime evidence until Phase 01 proves otherwise.

Strict rule:
- Implementation phases 02-07 are blocked until Phase 01 records a dirty worktree classification, dry-run output, phase inventory check, and runtime pointer self-check.
- Implementation phases 02-07 must not write directly to live `.claude/**` or `.codex/**`; they produce staged overlays and evidence only.
- Phase 08 is blocked until every staged overlay has an owner, manifest, verification record, and conflict classification.
- Any dirty path classified as `unknown` blocks subsequent phases.

Dirty worktree classification requirement:

| Field | Required Values |
|---|---|
| capture command | `git status --short --branch` |
| classification values | `baseline`, `draft`, `generated`, `superseded`, `unknown` |
| required table columns | `Path`, `Status`, `Classification`, `Owner`, `Allowed Action`, `Blocks Later Phases` |
| evidence path | `docs/implementation/harness-workflow-core-redesign-2026-05-29/readiness/worktree-classification.md` |
| blocker | Any `unknown` row or any implementation-owned path with unclear owner |

## Source Traceability Matrix

| Req ID | AC ID | Source | Requirement Summary | Phase | Plan File | Status |
|---|---|---|---|---|---|---|
| RC5 | AC-011 | Reviewer Iter 01 | Add readiness closeout with selected docs, stale docs, dirty action, runtime pointer action, dry-run command, readiness decision. | Phase 01 | `01-readiness-closeout.md` | planned |
| RC5 | AC-012 | Reviewer Iter 01 | Create standalone phase docs with phaseExecution metadata and runnable task detail. | Phases 01-06 | `01-*.md` through `06-*.md` | planned |
| RC1 | AC-001 | Master Goal | Introduce workflow registry as source of truth for entrypoint metadata, stage order, bundle selection, state authority, and verification profiles. | Phase 02 | `02-control-plane-registry.md` | planned |
| RC1 | AC-002 | Master Goal | `harness-bottleneck-audit.mjs` reports registry-derived skill budgets. | Phase 02 | `02-control-plane-registry.md` | planned |
| RC6 | AC-013 | Reviewer Iter 03 | Registry makes `forked-agent` the default execution mode and `delegated-terminal` only the fallback mode for `moonshot-phase-runner`. | Phase 02 | `02-control-plane-registry.md` | planned |
| RC6 | AC-015 | Reviewer Iter 03 | Scripts are deterministic helpers and do not own the primary orchestration, retry, or phase decision loop except in fallback/headless mode. | Phase 02, Phase 03 | `02-control-plane-registry.md`, `03-state-authority-refactor.md` | planned |
| RC2 | AC-003 | Master Goal | One state board/read model owns active phase, run, dispatch, verdict, stale warnings, and next action. | Phase 03 | `03-state-authority-refactor.md` | planned |
| RC2 | AC-004 | Master Goal | Stale projections are emitted as typed stale warnings rather than truth-source decisions. | Phase 03 | `03-state-authority-refactor.md` | planned |
| RC6 | AC-014 | Reviewer Iter 03 | State board models forked-agent attempt identity, parent-owned evidence collection, and delegated-terminal fallback warnings; `agent-loop.mjs` remains fallback-only. | Phase 03 | `03-state-authority-refactor.md` | planned |
| RC3 | AC-005 | Master Goal | Verifier commands declare explicit evidence classes. | Phase 04 | `04-evidence-pipeline-split.md` | planned |
| RC3 | AC-006 | Master Goal | Adapter smoke can pass without closeout scorecard while product closeout still requires AC/SCN evidence. | Phase 04 | `04-evidence-pipeline-split.md` | planned |
| RC1 | AC-007 | Master Goal | High-load skills use trigger contract plus deep references, with frontmatter metadata for surface status and line budget. | Phase 05 | `05-skill-surface-decomposition.md` | planned |
| RC1 | AC-008 | Master Goal | Staged `.codex/skills` mirror drift remains zero after skill surface migration; live mirror parity is checked after Phase 08 adoption. | Phase 05 | `05-skill-surface-decomposition.md` | planned |
| RC4 | AC-009 | Master Goal | Runtime/host failure taxonomy distinguishes product, harness contract, runtime capability, and host environment failures. | Phase 06 | `06-runtime-capability-taxonomy.md` | planned |
| RC4 | AC-010 | Master Goal | Capability preflight produces fallback or degraded evidence policy without blocking unrelated closeout. | Phase 06 | `06-runtime-capability-taxonomy.md` | planned |
| RC7 | AC-016 | User Follow-up | Every harness workflow entrypoint, internal skill, agent definition, command adapter, and Codex mirror is inventoried against the new forked-agent/control-plane/state/evidence contract. | Phase 07 | `07-cross-surface-propagation.md` | planned |
| RC7 | AC-017 | User Follow-up | Propagation parity checks prove no stale `delegated-terminal` primary default, script-owned primary loop, or unclassified agent/skill surface remains outside explicit exception lists. | Phase 07 | `07-cross-surface-propagation.md` | planned |
| RC8 | AC-018 | User Follow-up | Phase 02-07 outputs are staged overlays with manifests, not live `.claude` mutations. | Phases 02-07 | `02-*.md` through `07-*.md` | planned |
| RC8 | AC-019 | User Follow-up | A single controlled adoption phase applies staged `.claude`/`.codex` changes and proves global verification after adoption. | Phase 08 | `08-controlled-harness-adoption.md` | planned |

## Phase Index

| Phase | Objective | Depends On | Parallel Eligible | Primary AC |
|---|---|---|---|---|
| 01 - Readiness Closeout | Classify worktree/runtime readiness and prepare safe runner dispatch preconditions. | none | false | AC-011, AC-012 |
| 02 - Control Plane Registry | Add registry source of truth and encode forked-agent default execution mode. | 01 | false | AC-001, AC-002, AC-013, AC-015 |
| 03 - State Authority Refactor | Introduce authoritative state board/read model behavior for forked-agent primary plus fallback warnings. | 01, 02 | false | AC-003, AC-004, AC-014, AC-015 |
| 04 - Evidence Pipeline Split | Separate adapter, contract, product, runtime, host, closeout evidence classes. | 01, 02 | false | AC-005, AC-006 |
| 05 - Skill Surface Decomposition | Move policy bulk out of high-load skills behind metadata and references. | 01, 02, 04 | false | AC-007, AC-008 |
| 06 - Runtime Capability Taxonomy | Make runtime and host failures first-class classified outcomes. | 01, 02, 03, 04 | false | AC-009, AC-010 |
| 07 - Cross-Surface Propagation | Stage the new contract across all workflows, skills, agents, command adapters, and mirrors. | 01, 02, 03, 04, 05, 06 | false | AC-016, AC-017 |
| 08 - Controlled Harness Adoption | Adopt staged overlays into live `.claude`/`.codex` as one verified change set. | 01, 02, 03, 04, 05, 06, 07 | false | AC-018, AC-019 |

## Parallel Execution Plan

No phase is parallel-eligible in the first runnable package. The work touches shared workflow contracts, shared skill mirrors, shared verification commands, and runtime state readers. Phase 01 must run first. Phases 02-07 produce staged overlays only. Phase 08 runs last and is the only live harness adoption boundary.

## Phase-Specific Verification Matrix

| Phase | Commands | Expected Fail Signal | Expected Pass Signal | Evidence Target | Blocker |
|---|---|---|---|---|---|
| 01 | `git status --short --branch`; readiness dry-run command from closeout block | Unknown dirty path, `extraInRoot`, `missingFromRoot`, stale pointer mismatch | Classification has no `unknown`; dry-run reports matching phase inventory; pointers absent/archivable or target this package | `readiness/worktree-classification.md`, `readiness/prepare-dry-run.txt`, `readiness/pointer-self-check.md` | Any unknown owner or active external workstream |
| 02 | `HARNESS_OVERLAY_ROOT=.../staging/phase-02 node <overlay>/.claude/scripts/workflow-registry.mjs --print --overlay-root <overlay>` and staged tests | Registry parse failure, missing entrypoint, `moonshot-phase-runner` default is not `forked-agent`, fallback is not `delegated-terminal`, budget source still hardcoded | Tests pass against staged registry; output shows `defaultExecutionMode: forked-agent`, `fallbackExecutionMode: delegated-terminal`, and `agentLoopRole: legacy-headless-cron-fallback`; audit output names registry-derived budgets | `execution/phase-02/verification.md`, `execution/phase-02/registry-output.json` | Registry cannot represent current public entrypoints or deterministic script boundaries |
| 03 | `HARNESS_OVERLAY_ROOT=.../staging/phase-03 node <overlay>/.claude/scripts/phase-state-board.mjs --overlay-root <overlay>` and staged tests | Multiple authorities disagree silently, stale dispatch accepted as current, forked-agent attempt id absent, parent evidence collection absent, delegated-terminal fallback treated as primary | Status JSON exposes one next action, forked-agent attempt identity, parent evidence collection state, and typed fallback/stale warnings | `execution/phase-03/verification.md` | Existing closeout reader cannot consume board output without behavior break |
| 04 | `HARNESS_OVERLAY_ROOT=.../staging/phase-04 node <overlay>/.claude/scripts/evidence-router.mjs --overlay-root <overlay>` and staged tests | Adapter smoke requires scorecard, missing fixture seed is generic verifier failure | Adapter smoke class passes independently; product closeout still requires AC/SCN evidence | `execution/phase-04/verification.md` | Evidence class schema cannot cover existing verifier outputs |
| 05 | `HARNESS_OVERLAY_ROOT=.../staging/phase-05 node <overlay-or-live>/.claude/scripts/harness-bottleneck-audit.mjs --json --overlay-root <overlay>` plus staged mirror check | Policy removed without reference, staged mirror drift appears, behavior tests fail | Over-budget count drops in staging; staged mirror drift is 0; boundary tests pass against overlay | `execution/phase-05/verification.md` | Any public entrypoint loses hard stop or output artifact contract |
| 06 | `HARNESS_OVERLAY_ROOT=.../staging/phase-06 node <overlay>/.claude/scripts/runtime-capability-preflight.mjs --overlay-root <overlay>` and staged tests | Runtime/host failure is emitted as product failure or blocks unrelated closeout | Preflight emits typed failure with fallback/degraded policy | `execution/phase-06/verification.md` | Taxonomy contradicts existing closeout or verification contract semantics |
| 07 | `HARNESS_OVERLAY_ROOT=.../staging/phase-07 node <overlay>/.claude/scripts/harness-surface-inventory.mjs --json --overlay-root <overlay>` and propagation parity | Any workflow/skill/agent surface is unclassified, stale primary `delegated-terminal` default remains, script-owned primary loop remains, or staged mirror drift appears | Inventory covers staged `.claude/skills/**`, `.codex/skills/**`, `.claude/agents/**`, workflow docs, command adapters, and verification contracts; parity passes with explicit exceptions only | `execution/phase-07/surface-inventory.json`, `execution/phase-07/propagation-parity.json`, `execution/phase-07/verification.md` | Any public entrypoint, internal stage owner, agent, or command adapter cannot be classified safely |
| 08 | `node docs/implementation/harness-workflow-core-redesign-2026-05-29/execution/tooling/harness-adoption-plan.mjs --check-staging`; `node .../tooling/harness-adoption-plan.mjs --dry-run`; post-adoption global checks | Missing staged manifest, conflicting live target, partial adoption, mirror drift, or failed global check | One adoption manifest applies all approved staged overlays and post-adoption verification passes | `execution/phase-08/adoption-manifest.json`, `execution/phase-08/post-adoption-verification.md` | Any staged overlay lacks owner, evidence, or conflict classification |

Global checks:
- Phase 02-07: run overlay-aware knowledge/boundary checks against `HARNESS_OVERLAY_ROOT`, plus `git diff --check`.
- Phase 08: run live `harness-bottleneck-audit`, boundary verification, knowledge audit, runtime status, and `git diff --check` after adoption.

## Phase Completion Checklist

- [x] Phase 01 - Readiness Closeout (`01-readiness-closeout.md`)
- [x] Phase 02 - Control Plane Registry (`02-control-plane-registry.md`)
- [x] Phase 03 - State Authority Refactor (`03-state-authority-refactor.md`)
- [x] Phase 04 - Evidence Pipeline Split (`04-evidence-pipeline-split.md`)
- [x] Phase 05 - Skill Surface Decomposition (`05-skill-surface-decomposition.md`)
- [x] Phase 06 - Runtime Capability Taxonomy (`06-runtime-capability-taxonomy.md`)
- [x] Phase 07 - Cross-Surface Propagation (`07-cross-surface-propagation.md`)
- [x] Phase 08 - Controlled Harness Adoption (`08-controlled-harness-adoption.md`)

## Plan Quality Loop

Iteration 01 reviewer decision: `revise`.

Reviewer ambiguity score: `0.34`.

Applied revision intent:
- Added Plan Package Readiness Closeout with `prep_phase_required`.
- Added AC traceability matrix from root causes and reviewer directives to phases.
- Added dirty worktree classification requirement and hard blocker semantics.
- Replaced generic verification placeholders with phase-specific commands, fail/pass signals, evidence targets, and blockers.
- Added standalone phase docs with phaseExecution metadata.
- Iteration 03 revision adds forked-agent as the default execution mode, demotes `agent-loop.mjs` to legacy/headless/cron fallback, and makes scripts deterministic helpers rather than primary orchestration owners.
- Follow-up propagation revision adds Phase 07 so the same contract is inventoried and enforced across all workflow, skill, agent, command adapter, verification contract, and Codex mirror surfaces.
- Follow-up adoption revision adds Phase 08 so Phase 02-07 cannot mutate live `.claude`/`.codex` surfaces directly.

Current controller readiness decision: `runner_prepared`. The package has been seeded into `.claude/docs/phase-status.yaml` with 8 pending phases and is ready for phase-runner execution starting at Phase 01.
