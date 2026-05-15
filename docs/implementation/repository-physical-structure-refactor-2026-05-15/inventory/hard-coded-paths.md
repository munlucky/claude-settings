# Hard-Coded `.claude/` Path Inventory

Phase: P01 - Source Boundary Inventory

Evidence:

- `docs/implementation/repository-physical-structure-refactor-2026-05-15/evidence/p01-hard-coded-path-rg.txt`
- Command: `rg -n "\.claude/" README.md AGENTS.md docs .claude install-claude.sh install-claude.ps1`

The raw evidence file contains the full hit list. This inventory assigns every hit to one migration decision by matching the referenced `.claude/` path against the decision rules below. If multiple rules could match, the first rule wins.

## Migration Decision Rules

| Priority | Reference pattern | Migration decision | Target class | Applies to |
| --- | --- | --- | --- | --- |
| 1 | `.claude/logs`, `.claude/cache`, `.claude/traces`, `.claude/browser-artifacts`, `.claude/browser-runtime`, `.claude/runtime-state.sqlite*`, `.claude/memorygraph`, `.claude/memory.json`, `.claude/*verdict*.json`, `.claude/knowledge-repo-audit-*.json`, `.code-review-graph` | Keep references as runtime-state denylist/exclusion references or migrate to the future runtime-state root when phase 05 defines it. Do not treat as package source. | `runtime_state` | Runtime state docs, scripts, tests, verification logs, and ignore/package rules. |
| 2 | `.claude/skills-archive` | Preserve only as history references; do not install by default. | `deprecated_history` | Historical skill documentation or migration notes. |
| 3 | `.claude/scripts/fixtures`, `.claude/tests`, `.claude/tests/fixtures`, `.claude/code-policy-baseline.txt` | Keep with tests/fixtures or update to the future test fixture path. | `fixture_or_test` | Regression tests, test fixtures, fixture docs. |
| 4 | `.claude/skills`, `.claude/agents`, `.claude/rules`, `.claude/scripts`, `.claude/schemas`, `.claude/templates`, `.claude/verification.contract.yaml` | Update to the future canonical package/source path when the physical split lands; source-of-truth references must not remain anchored to `.claude/` except through compatibility wrappers. | `canonical_source` | Skills, agents, rules, scripts, schemas, templates, verification contract, and references from installers/tests/docs. |
| 5 | `.claude/CLAUDE.md`, `.claude/CLAUDE.ko.md`, `.claude/PROJECT.md`, `.claude/PROJECT.ko.md`, `.claude/config`, `.claude/settings.local.json`, `.claude/docs/phase-status.yaml`, `.claude/docs/tasks`, `.claude/docs/moonshot-analysis.yaml` | Keep or rewrite as repository dev-profile references; these are not package source. | `dev_profile` | Workspace profile, local config, active phase state, task state, local runtime analysis. |
| 6 | `.claude/docs/guidelines`, `.claude/docs/reference`, `.claude/docs/reference-downstream`, `.claude/README.md`, `.claude/README.ko.md` | Move or mirror to public `docs/` or package documentation paths, keeping only compatibility references where needed. | `installed_payload` | Public documentation and references that users or installers may consume. |
| 7 | `.claude/bin`, `.claude/tools`, `.claude/tools/browserd` | Treat as package/install materialization boundary; generated dependency output remains excluded and wrapper paths become compatibility/install references. | `compat_wrapper` | Tool wrappers, browserd wrapper references, installer materialization paths. |
| 8 | Any remaining `.claude/` reference in the evidence file | Review during the relevant later phase before movement; default to `dev_profile` only when the reference is repository-local state, otherwise default to `canonical_source`. | `dev_profile` or `canonical_source` | Safety net for unusual documentation strings or templated examples. |

## Required Path Group Decisions

| Path group | Decision | Notes |
| --- | --- | --- |
| `.claude/skills/` | `canonical_source` | Move source definitions to canonical package/source layout in later phases. |
| `.claude/agents/` | `canonical_source` | Move source definitions to canonical package/source layout in later phases. |
| `.claude/rules/` | `canonical_source` | Move policy source to canonical package/source layout in later phases. |
| `.claude/scripts/` | `canonical_source` | Move executable source; split `.claude/scripts/fixtures` to `fixture_or_test`. |
| `.claude/schemas/` | `canonical_source` | Move schema source to canonical package/source layout. |
| `.claude/templates/` | `canonical_source` | Move template source to canonical package/source layout. |
| `.claude/docs/` | `installed_payload` / `dev_profile` / `runtime_state` by subtree | Public guidelines/reference docs migrate to docs/package docs; task/status/report state remains dev/runtime-only. |
| `.claude/config/` | `dev_profile` | Repository-local runtime config. |
| `.claude/tests/` | `fixture_or_test` | Test source and regression fixtures. |
| `.claude/browser-runtime/` | `runtime_state` | Exclude from package payloads. |
| `.claude/browser-artifacts/` | `runtime_state` | Exclude from package payloads. |
| `.claude/cache/` | `runtime_state` | Exclude from package payloads. |
| `.claude/logs/` | `runtime_state` | Exclude from package payloads. |
| `.claude/traces/` | `runtime_state` | Exclude from package payloads. |
| `.claude/memorygraph/` | `runtime_state` | Exclude from package payloads. |
| `.claude/runtime-state.sqlite*` | `runtime_state` | Exclude from package payloads. |
| `.claude/*verdict*.json` | `runtime_state` | Exclude from package payloads. |
| `.claude/knowledge-repo-audit-*.json` | `runtime_state` | Exclude from package payloads. |
| `.claude/memory.json` | `runtime_state` | Exclude from package payloads. |

## Evidence Coverage

The raw evidence file was regenerated through a temporary output file to avoid self-references from the evidence artifact itself. It contains the full command output for scripts, docs, tests, skills, agents, installers, and top-level docs.

Later phases should update references according to the table above rather than inferring intent from the current physical `.claude/` path.
