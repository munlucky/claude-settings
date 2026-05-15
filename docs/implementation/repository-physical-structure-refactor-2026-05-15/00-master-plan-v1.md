# Repository Physical Structure Refactor Master Plan v1

> This package defines the repository-layout migration needed to make `claude-settings` suitable for open-source distribution while preserving the current Moonshot harness during development.

## Source Baseline

- User request on 2026-05-15: the current harness work modifies `.claude` while that same `.claude` is active runtime context, which is uncomfortable and likely not open-source friendly.
- Local root [README.md](/Users/dev/claude-settings/README.md) (role: current public description and install behavior).
- Local [.claude/README.md](/Users/dev/claude-settings/.claude/README.md) (role: current workflow surface and `.claude` path assumptions).
- Local [.claude/CLAUDE.md](/Users/dev/claude-settings/.claude/CLAUDE.md) (role: always-loaded TOC and runtime contract).
- Local [.gitignore](/Users/dev/claude-settings/.gitignore) (role: current runtime-artifact denylist).
- Local [docs/analysis/ouroboros-harness-adoption-inventory.md](/Users/dev/claude-settings/docs/analysis/ouroboros-harness-adoption-inventory.md) (role: prior Ouroboros pattern inventory).
- External reference: `Q00/ouroboros` repository layout reviewed on 2026-05-15. It separates product source under `src/ouroboros/`, plugin wrapper under `.claude-plugin/`, and runtime data under user/project state paths.
- External reference: `obra/superpowers` repository layout reviewed on 2026-05-15. It keeps canonical sources at root-level `skills/`, `hooks/`, `scripts/`, `tests/`, with thin runtime wrappers such as `.claude-plugin/` and `.codex-plugin/`.

## Problem Statement

The repository currently uses `.claude/` as three different things:

1. Development-time agent context for this repository.
2. Canonical distributable harness source: skills, agents, rules, scripts, schemas, templates, docs.
3. Runtime state and generated evidence: logs, caches, traces, browser artifacts, sqlite state, verdict JSON, memorygraph data.

This creates a self-referential maintenance loop. While editing the harness, the active agent is also reading the harness-under-edit as ambient instruction context. It also makes the public repository harder to reason about because stable source, generated state, and local development policy share the same top-level namespace.

## Goal Contract Readiness

```yaml
goalContract:
  goalClarity: high
  scopeClarity: high
  acceptanceCriteriaClarity: medium_high
  verificationClarity: medium_high
  clarityScore: 0.88
  ambiguityScore: 0.12
  readinessDecision: review_passed_ready_for_runnable_preparation_dry_run
  strictRunnableReadiness: false
  isolationNote: "Forked Reviewer Agent iteration 2 passed after Writer Agent iteration 1 and Controller metadata normalization."
  readinessBlockers:
    - "Do not rewrite `.claude/docs/phase-status.yaml` until this package is intentionally selected as the active runner target."
    - "Run `prepare-implementation-plan-state.mjs --dry-run` before runnable dispatch."
    - "Public plugin/package naming remains open before external release or marketplace submission."
```

## Objective

Restructure the repository so canonical harness source lives outside `.claude/`, runtime wrappers are thin and explicit, and generated state is excluded from the distributable source tree. Preserve compatibility for downstream projects that currently install a `.claude/` tree through `install-claude.sh`.

## Non-Goals

- Do not remove Claude Code support.
- Do not rewrite the Moonshot workflow model, phase runner semantics, or verification contract in this migration.
- Do not delete historical implementation plans, QA reports, or analysis documents.
- Do not require all users to adopt plugin installation immediately; script-based installation remains supported during migration.
- Do not move runtime artifacts without a compatibility shim and cleanup guide.
- Do not make `.claude/` empty; keep it as a minimal dev-only dogfood profile for this repository.

## Target Repository Shape

```text
claude-settings/
├── AGENTS.md
├── README.md
├── install-claude.sh
├── install-claude.ps1
├── package/
│   ├── claude/
│   │   └── profile/              # generated or curated target `.claude` payload
│   └── codex/
│       └── profile/              # generated or curated target `.codex` payload
├── skills/                       # canonical SKILL.md source
├── agents/                       # canonical agent definitions
├── rules/                        # canonical shared rules
├── scripts/                      # canonical harness scripts and CLI adapters
├── bin/                          # canonical CLI entrypoints
├── tools/                        # canonical runtime tooling source
├── schemas/                      # canonical schemas
├── templates/                    # canonical templates
├── docs/
│   ├── implementation/
│   ├── analysis/
│   └── public/                   # public docs for install/use/architecture
├── tests/                        # canonical tests for scripts and package materialization
├── .claude-plugin/               # Claude plugin manifest/wrapper only
├── .codex-plugin/                # Codex plugin manifest/wrapper only
├── .claude/                      # dev-only dogfood profile for this repository
└── .harness-state/ or .moonshot/  # ignored generated state, if project-local state remains needed
```

## Stable Boundary Rules

| Boundary | Rule |
| --- | --- |
| Canonical source | `skills/`, `agents/`, `rules/`, `scripts/`, `bin/`, `tools/`, `schemas/`, `templates/`, and selected public docs are the source of truth. |
| Dev dogfood profile | `.claude/` may import or mirror canonical source, but is not the source of truth for distributable artifacts. |
| Runtime wrapper | `.claude-plugin/` and `.codex-plugin/` contain manifests, marketplace metadata, and runtime-specific links only. |
| Generated state | Logs, caches, traces, sqlite, browser artifacts, verdicts, memorygraph data, and temporary reports live in ignored state roots. |
| Installer output | `install-claude.*` materializes canonical source into a target project's `.claude/`, `.codex/`, or runtime-specific config. |
| Compatibility | Existing downstream `.claude/...` paths keep working through wrappers, symlinks, or generated packages until the migration is complete. |

## Requirements

| Req ID | Requirement |
| --- | --- |
| REQ-1 | Separate canonical source from the active `.claude/` development profile. |
| REQ-2 | Introduce thin plugin/package wrappers for Claude and Codex without duplicating source files. |
| REQ-3 | Move generated runtime state out of distributable source paths or keep it strictly ignored under a dedicated state root. |
| REQ-4 | Preserve existing installer behavior for downstream projects during a compatibility window. |
| REQ-5 | Provide migration tooling that can compare old `.claude` payloads with new generated payloads before any destructive change. |
| REQ-6 | Update docs so contributors understand which directory is source, wrapper, generated output, or local-only state. |
| REQ-7 | Add regression tests proving materialized `.claude` payloads still include required skills, rules, scripts, schemas, templates, and verification contract files. |

## Acceptance Criteria

| AC ID | Req ID | Acceptance Criteria | Evidence Target |
| --- | --- | --- | --- |
| AC-01 | REQ-1 | Canonical skills, agents, rules, scripts, schemas, and templates have root-level source directories or an explicit `package/` source boundary; `.claude/` is documented as dev-only. | `node --test tests/package-layout.test.mjs`, `git diff --check` |
| AC-02 | REQ-2 | `.claude-plugin/plugin.json` and `.codex-plugin/plugin.json` point to canonical source or generated package payloads and do not require `.claude/` to be the canonical source. | `node --test tests/plugin-manifest.test.mjs` |
| AC-03 | REQ-3 | Generated state paths are consolidated in `.gitignore`, and no runtime artifacts are included in generated package payloads. | `node --test tests/package-materialization.test.mjs --test-name-pattern "excludes runtime state"` |
| AC-04 | REQ-4 | `install-claude.sh --dry-run` and `install-claude.ps1 -DryRun` show the same downstream payload contract before and after source relocation. | `bash install-claude.sh --dry-run`, PowerShell dry-run on Windows validation environment |
| AC-05 | REQ-5 | A migration audit script reports moved files, generated aliases, stale `.claude` source references, and unresolved hard-coded paths. | `node --test tests/migration-audit.test.mjs` |
| AC-06 | REQ-6 | README, `.claude/README.md`, and contributor docs explain source/wrapper/state boundaries and migration phases. | `node .claude/scripts/knowledge-repo-audit.mjs` or `.claude/scripts/knowledge-repo-audit.sh` |
| AC-07 | REQ-7 | Existing harness script tests pass through compatibility wrappers or updated imports after relocation. | `node --test .claude/scripts/*.test.mjs .claude/scripts/lib/*.test.mjs` during transition, then `node --test tests/**/*.test.mjs` after final relocation |

## Phase Index

| Phase | Title | Plan File | Depends On |
| --- | --- | --- | --- |
| 01 | Source Boundary Inventory | `01-source-boundary-inventory-v1.md` | - |
| 02 | Canonical Layout And Package Contract | `02-canonical-layout-package-contract-v1.md` | 01 |
| 03 | Dev-only `.claude` Profile | `03-dev-only-claude-profile-v1.md` | 01, 02 |
| 04 | Installer And Plugin Materialization | `04-installer-plugin-materialization-v1.md` | 02, 03 |
| 05 | Runtime State Extraction | `05-runtime-state-extraction-v1.md` | 01, 02 |
| 06 | Compatibility Migration And Docs | `06-compatibility-migration-docs-v1.md` | 03, 04, 05 |

## Execution Order Notes

- Phase 01 must run first because current `.claude` paths need classification before any move.
- Phase 02 defines target boundaries and package semantics before code changes.
- Phase 03 shrinks `.claude/` only after canonical source directories exist.
- Phase 04 updates installers and plugin manifests after source/profile boundaries are stable.
- Phase 05 can start after Phase 02, but should merge after Phase 04 to avoid breaking installer assumptions.
- Phase 06 closes the migration with compatibility docs, path reference updates, and contributor guidance.

## Parallel Execution Plan

Keep implementation sequential by default. This migration touches shared path assumptions across scripts, docs, installers, plugin metadata, and runtime state. Limited parallel work is allowed only after Phase 01 produces a path ownership table:

| Wave | Phases | Eligibility | Blockers / Notes |
| --- | --- | --- | --- |
| wave-1 | 01 | sequential | Builds the ownership inventory and hard-coded path map. |
| wave-2 | 02 | sequential | Establishes target layout and package contract. |
| wave-3 | 03, 05 | conditional parallel | Allowed only if Phase 03 owns dev profile files and Phase 05 owns ignored state policy and state-path adapters. |
| wave-4 | 04 | sequential | Installer/plugin materialization consumes final boundaries. |
| closeout | 06 | sequential | Docs and compatibility closeout must reflect actual implementation. |

## Source Traceability Matrix

| Req ID | AC ID | Source | Requirement Summary | Phase |
| --- | --- | --- | --- | --- |
| REQ-1 | AC-01 | User concern, current `.claude` structure | Stop treating active `.claude/` as canonical source. | 01, 02, 03 |
| REQ-2 | AC-02 | Ouroboros, Superpowers references | Add thin runtime-specific plugin wrappers. | 02, 04 |
| REQ-3 | AC-03 | `.gitignore`, `.claude` artifact inventory | Extract or isolate generated state. | 01, 05 |
| REQ-4 | AC-04 | README installer contract | Preserve script-based downstream install. | 04, 06 |
| REQ-5 | AC-05 | Migration risk | Add non-destructive audit before moving paths. | 01, 04, 06 |
| REQ-6 | AC-06 | README and `.claude/README.md` | Document source/wrapper/state boundaries. | 06 |
| REQ-7 | AC-07 | Existing harness tests | Prove relocated paths preserve behavior. | 04, 06 |

## Phase-To-AC Matrix

| AC ID | Phase Tasks | Evidence Commands | Evidence Paths |
| --- | --- | --- | --- |
| AC-01 | P01-T01, P01-T03, P02-T01, P02-T02, P03-T01, P03-T02, P06-T03 | `find .claude -maxdepth 2 -type d \| sort`; `node --test tests/package-layout.test.mjs`; `node --test tests/package-materialization.test.mjs --test-name-pattern "dev profile"` | `inventory/path-boundary-map.yaml`; `evidence/p02-package-layout-test.txt`; `evidence/p03-dev-profile-test.txt`; `evidence/p06-package-layout-test.txt` |
| AC-02 | P01-T03, P02-T02, P04-T02, P06-T03 | `node --test tests/plugin-manifest.test.mjs` | `evidence/p04-plugin-manifest-test.txt`; `evidence/p06-plugin-manifest-test.txt` |
| AC-03 | P01-T01, P01-T02, P02-T02, P03-T03, P04-T03, P05-T01, P05-T03, P06-T03 | `rg -n "runtime-state\|memorygraph\|browser-artifacts\|traces\|logs\|cache\|verdict"`; `node --test tests/package-materialization.test.mjs --test-name-pattern "excludes runtime state"`; `node --test tests/package-materialization.test.mjs` | `inventory/runtime-artifact-denylist.md`; `evidence/p05-package-state-exclusion-test.txt`; `evidence/p06-package-materialization-test.txt` |
| AC-04 | P01-T03, P04-T01, P06-T03 | `bash install-claude.sh --dry-run`; `.\install-claude.ps1 -DryRun` | `evidence/p04-install-sh-dry-run.txt`; `evidence/p04-install-ps1-dry-run.txt`; `evidence/p06-install-sh-dry-run.txt` |
| AC-05 | P01-T02, P01-T03, P05-T02, P06-T02 | `node --test tests/migration-audit.test.mjs`; `rg -n "\\.claude/" README.md AGENTS.md docs .claude install-claude.sh install-claude.ps1` | `inventory/hard-coded-paths.md`; `evidence/p05-migration-audit-test.txt`; `evidence/p06-migration-audit-test.txt` |
| AC-06 | P02-T03, P03-T01, P05-T04, P06-T01, P06-T04 | `.claude/scripts/knowledge-repo-audit.sh`; `rg -n "canonical source\|development profile\|generated state"` | `docs/public/repository-layout.md`; `docs/public/runtime-state-cleanup.md`; `evidence/p06-knowledge-repo-audit.txt`; `evidence/p06-closeout-summary.md` |
| AC-07 | P02-T02, P03-T02, P03-T03, P04-T03, P05-T03, P06-T02, P06-T03 | `node --test tests/package-materialization.test.mjs`; `node --test tests/migration-audit.test.mjs`; transition command `node --test .claude/scripts/*.test.mjs .claude/scripts/lib/*.test.mjs` when wrappers are touched | `evidence/p04-package-materialization-test.txt`; `evidence/p05-package-state-exclusion-test.txt`; `evidence/p06-migration-audit-test.txt`; `evidence/p06-package-materialization-test.txt` |

## Unmapped Source Requirements

- None. External reference patterns are treated as architecture references, not as requirements to copy wholesale.

## Phase Completion Checklist

- [x] Phase 01 - Source Boundary Inventory (`01-source-boundary-inventory-v1.md`)
- [x] Phase 02 - Canonical Layout And Package Contract (`02-canonical-layout-package-contract-v1.md`)
- [x] Phase 03 - Dev-only `.claude` Profile (`03-dev-only-claude-profile-v1.md`)
- [x] Phase 04 - Installer And Plugin Materialization (`04-installer-plugin-materialization-v1.md`) - accepted with TODO `P04-WIN-DRYRUN`
- [x] Phase 05 - Runtime State Extraction (`05-runtime-state-extraction-v1.md`)
- [x] Phase 06 - Compatibility Migration And Docs (`06-compatibility-migration-docs-v1.md`)
- [x] Corrective Patch - Populate canonical root source directories with actual harness files and guard against README-only placeholders

## Plan Quality Loop

Status: review loop passed after revision iteration 1 and Reviewer Agent iteration 2.

The Independent Planning Loop completed with separate Reviewer and Writer sessions:

- Iteration 1 Reviewer Agent result: `revise`, ambiguityScore `0.30`, blocking findings BF-01 through BF-03.
- Writer Agent revision: `planning-loop/plan-writer-revision-iter-01.yaml`.
- Controller refresh: normalized phase metadata to the required `phaseExecution` schema.
- Iteration 2 Reviewer Agent result: `pass`, ambiguityScore `0.12`, zero blocking findings, zero improvement directives.

Current controller decision: `review_passed_ready_for_runnable_preparation_dry_run`.

`strictRunnableReadiness` remains `false` only because runnable preparation has not been executed. Before dispatch, run `prepare-implementation-plan-state.mjs --dry-run`, verify phase inventory alignment, and ensure no active workflow-enforcement pointers reference another workstream.

## Follow-up TODOs

| ID | Phase | Status | Runtime | Command | Notes |
| --- | --- | --- | --- | --- | --- |
| P04-WIN-DRYRUN | 04 | todo | Windows / PowerShell | `.\install-claude.ps1 -DryRun` | Phase 04 is treated as passed for sequencing. Replace `evidence/p04-install-ps1-dry-run.txt` with passing Windows evidence when available. |

## Corrective Patch Notes

The first implementation pass created the canonical directory boundaries but left most root-level source directories as README-only scaffolding. That did not satisfy the physical-structure objective: the repository shape was documented, but the root directories did not yet function as harness source.

The corrective patch materializes the existing harness assets into the root canonical directories:

- `skills/`
- `agents/`
- `rules/`
- `scripts/`
- `bin/`
- `tools/`
- `schemas/`
- `templates/`

`.claude/` remains the local development profile and compatibility runtime surface. New durable harness changes must start from the canonical root directories, and package/profile output must be refreshed from those roots.

## Verification Plan

Minimum verification after implementation:

```bash
node --test tests/package-layout.test.mjs
node --test tests/plugin-manifest.test.mjs
node --test tests/package-materialization.test.mjs
node --test tests/migration-audit.test.mjs
bash install-claude.sh --dry-run
.claude/scripts/knowledge-repo-audit.sh
git diff --check
```

During the transition, keep compatibility verification for existing script paths:

```bash
node --test .claude/scripts/*.test.mjs
node --test .claude/scripts/lib/*.test.mjs
```

## Runnable Preparation Gate

- Do not run `prepare-implementation-plan-state.mjs` until the planning loop passes.
- Do not rewrite `.claude/docs/phase-status.yaml` as part of this planning package.
- Before execution, run a dry-run migration audit that lists every proposed move, generated alias, symlink, or wrapper.
- The first implementation phase must be reversible by keeping old `.claude` path wrappers until the final closeout phase.

## Completion Rule

The migration is complete only when:

- Canonical source no longer depends on `.claude/` as its primary path.
- `.claude/` is documented and tested as a dev-only profile for this repository.
- Installers and plugin manifests materialize the same downstream runtime payload from canonical source.
- Generated state is outside source/package payloads and blocked by tests.
- Public docs explain how contributors add a skill, script, rule, schema, or template without editing generated output.
