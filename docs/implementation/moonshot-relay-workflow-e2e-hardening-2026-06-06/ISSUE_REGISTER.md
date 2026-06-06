# Issue Register

## Source/Profile Bootstrap And Document Paths

| ID | Finding | Evidence | Risk | Phase |
| --- | --- | --- | --- | --- |
| WF-01 | Root `AGENTS.md` points to `.claude/CLAUDE.md`, but this source checkout does not have that file. | `AGENTS.md:1`; `.claude/` contains runtime verdict/audit JSON only | workflow start failure | 01 |
| WF-02 | README describes source checkout layout with `AGENTS.md -> .claude/CLAUDE.md`, which is not true in this checkout. | `README.md:61` | stale bootstrap docs | 01 |
| WF-03 | Active rules still cite `.claude/CLAUDE.md` or `.claude/PROJECT.md` as if present source. | `rules/coding-style.md:8`, `rules/quality.md:5`, `rules/agents/agent-definition.md:8` | missing profile contract | 01 |
| WF-04 | Agents use `.claude/features` examples while current analysis schema uses `{tasksRoot}/{feature-name}`. | `agents/requirements-analyzer.md:26`, `agents/context-builder.md:29`, `agents/verification-agent.md:32` | handoff path split | 01 |
| WF-05 | Runtime task roots conflict across README, profile templates, and phase work. | `README.md:18`, `README.md:140`, `package/profile-templates/claude/.claude/CLAUDE.md:19`, `package/profile-templates/claude/.claude/PROJECT.md:63` | agent output fragmentation | 01 |
| WF-06 | Profile `documentPaths` consistency is not tested. | `tests/active-contracts.test.mjs` covers guideline paths but not `tasksRoot` consistency | false pass | 01,04 |
| WF-07 | `docs/moonshot-phase-runner-user-workflow.md` is outside package `files` public docs surface. | `package.json:20` only includes `docs/public/` | installed user docs missing | 01 |
| WF-08 | Slash-skill examples can read as CLI commands even though package bin exposes only `moonshot-relay`. | `docs/moonshot-phase-runner-user-workflow.md:28`, `package.json:6` | operator confusion | 01 |

## Plan Package And Phase-Runner Bridge

| ID | Finding | Evidence | Risk | Phase |
| --- | --- | --- | --- | --- |
| WF-09 | Plan package contract can pass with master/phase/review files only, while phase-runner needs `phase-status.yaml` and execution artifacts. | `skills/moonshot-plan-writer/references/plan-package-contract.md:7`, `skills/moonshot-phase-runner/SKILL.md:32` | runnable plan false pass | 02 |
| WF-10 | Active plan-state preparation entrypoint is absent; equivalent script is archive-only. | `Test-Path scripts/prepare-implementation-plan-state.mjs` false; `archive/scripts/legacy-phase-adapters/prepare-implementation-plan-state.mjs` exists | manual-only readiness | 02 |
| WF-11 | Plan template says "installed plan-state preparation entrypoint" but package contract intentionally excludes workflow orchestration scripts. | `skills/moonshot-plan-writer/assets/master-plan.template.md:50`, `package/package-contract.yaml:121` | broken installed workflow | 02 |
| WF-12 | Slugged plan root rule conflicts with template paths hardcoded to root `docs/implementation`. | `skills/moonshot-plan-writer/references/plan-package-contract.md:13`, `skills/moonshot-plan-writer/assets/master-plan.template.md:27` | plan collision | 02 |
| WF-13 | Demo-first phase artifacts are root-level, not package-local. | `skills/moonshot-plan-writer/assets/phase-plan.template.md:37` | artifact collision | 02 |
| WF-14 | `<plan-dir>` omission has no deterministic resolver with multiple plan packages. | `README.md:102`, many `docs/implementation/*` packages | wrong plan selected | 02 |
| WF-15 | Existing plan package baseline is stale (`ahead 4`) while current repo is not ahead. | `docs/implementation/moonshot-relay-remaining-contract-cleanup-2026-06-06/00-master-plan-v1.md:9` | stale plan reuse | 02 |
| WF-16 | In-session coordinator describes Codex fork/session abstractly, without concrete tool mapping or fallback artifact protocol. | `skills/moonshot-in-session-coordinator/SKILL.md:109` | runtime-specific execution gap | 02 |
| WF-17 | Fallback contracts conflict: coordinator template allows direct execution, executor says stop if fresh attempts cannot be made. | `templates/execution/PHASE_COORDINATOR_CONTRACT.md:1`, `skills/moonshot-phase-executor/SKILL.md:61` | ambiguous failure handling | 02 |
| WF-18 | Workflow bundle registry does not include phase-runner/executor path although README presents phase-runner as primary for large work. | `README.md:101`, `rules/workflow-bundles.yaml:29` | routing drift | 02 |

## Closeout Artifact And Completion Evidence

| ID | Finding | Evidence | Risk | Phase |
| --- | --- | --- | --- | --- |
| WF-19 | Workflow closeout commands are legacy archive-only while active phase-runner references fresh closeout evidence. | `schemas/verification.contract.yaml:14`, `skills/moonshot-phase-runner/references/closeout-gates.md:7` | no active closeout gate | 03 |
| WF-20 | Execution artifacts are ignored wholesale, so clone-level evidence can disappear. | `.gitignore:40`, `.gitignore:41`, `.gitignore:42` | unreproducible closeout | 03 |
| WF-21 | Plan-level closeout convention is not defined; recent package uses root `QA_REPORT.md/HANDOFF.md` ad hoc. | `docs/implementation/moonshot-relay-remaining-contract-cleanup-2026-06-06/QA_REPORT.md:5` | inconsistent closeout | 03 |
| WF-22 | QA/SCORECARD/HANDOFF are Markdown authority; no canonical `phase-closeout.json` or `plan-closeout.json`. | `templates/execution/QA_REPORT.template.md:9`, `templates/execution/SCORECARD.template.md:23` | machine-check weakness | 03 |
| WF-23 | QA/HANDOFF templates carry UI/demo/UAT sections even for harness/docs-only work. | `templates/execution/QA_REPORT.template.md:49`, `templates/execution/HANDOFF.template.md:22` | placeholder burden | 03,07 |
| WF-24 | Plan closure gate is path/keyword based and does not validate SCN/REQ/evidence matrix. | `skills/moonshot-plan-writer/references/plan-package-contract.md:17`, `skills/moonshot-plan-writer/assets/phase-plan.template.md:72` | semantic false pass | 03 |
| WF-25 | Non-commit repository closeout is undefined though `commit-moonshot` is explicit opt-in. | `skills/moonshot-phase-runner/SKILL.md:54`, `skills/commit-moonshot/SKILL.md:7` | closeout ambiguity | 03 |

## Verification And Platform Gates

| ID | Finding | Evidence | Risk | Phase |
| --- | --- | --- | --- | --- |
| WF-26 | README suggests `node --test tests/*.mjs`, which runs legacy tests despite active/legacy split. | `README.md:35`, `README.md:38`, `package.json:10` | unnecessary false-fail | 04 |
| WF-27 | Schema checks are regex-heavy; YAML/JSON parse and fixture validation are not default active gates. | `tests/package-layout.test.mjs:133`, `schemas/verification.contract.yaml:199` | schema false pass | 04 |
| WF-28 | Active shell gate checks LF but not `bash -n` for active shell files. | `tests/active-contracts.test.mjs:295` | syntax false pass | 04 |
| WF-29 | PowerShell parser diagnostics are tested, but `.ps1` files are not parsed in default gate. | `tests/harness-regression-contract.test.mjs:29` | syntax false pass | 04 |
| WF-30 | Dry-run package tests check planned array existence but not exact critical entries/prohibited targets/schema. | `tests/active-contracts.test.mjs:277` | materialization drift | 04,06 |
| WF-31 | Workflow evidence warnings in verification scripts are not covered by active fixture tests proving they block clean pass. | `agents/verification/verify-changes.sh:478`, `skills/completion-verifier/SKILL.md:69` | workflow false pass | 04 |
| WF-32 | Browser-flow shell path is skipped on this machine due to Git Bash/MSYS detection. | `tests/active-contracts.test.mjs:58` | runtime gap hidden by skip | 04 |
| WF-33 | Public guideline classification test accepts placeholder-detector-only depth. | `docs/public/repository-layout.md:69`, `tests/active-contracts.test.mjs:134` | shallow policy docs | 04 |
| WF-34 | E2E workflow regression is absent: no synthetic `discover -> plan -> review -> prepare -> attempt -> closeout` fixture. | `package.json:10` active tests are contract/package-focused | workflow false pass | 07 |

## Install, Runtime, Browser, And Materialization

| ID | Finding | Evidence | Risk | Phase |
| --- | --- | --- | --- | --- |
| WF-35 | Account-root reinstall replaces `tools/`, which can delete `tools/browserd/node_modules`. | `scripts/install-account-root-harness.mjs:354`, `scripts/install-account-root-harness.mjs:534` | browser runtime breakage | 05 |
| WF-36 | `browserctl` requires `tools/browserd/node_modules/playwright`, but installer does not rebootstrap it. | `tools/browserd/client.mjs:45`, `tools/browserd/client.mjs:230` | setup-gap after sync | 05 |
| WF-37 | Default browser-flow runner path is `<MOONSHOT_RELAY_HOME>/scripts/browser-flow-runner.mjs`, but no such support script is packaged. | `agents/verification/verify-runtime.sh:604`, `package/build-package.mjs:39` | browser-flow default fails | 05 |
| WF-38 | Codex `config.toml` template changes are not applied by account-root reinstall and existing config is protected. | `scripts/install-account-root-harness.mjs:92`, `scripts/install-account-root-harness.mjs:113` | hidden MCP config drift | 05 |
| WF-39 | browserd docs still describe `.claude/browser-runtime/state.json` while resolver uses root-relative `browser-runtime`. | `tools/browserd/runtime-paths.mjs:8`, `tools/browserd/README.md:16` | install boundary confusion | 05 |
| WF-40 | Project-local installer symlinks `AGENTS.md` despite package contract avoiding required symlinks. | `install-claude.sh:270`, `package/package-contract.yaml:26` | Windows install fragility | 05 |
| WF-41 | `install-claude.sh --project` copies scripts into `.claude/scripts`, conflicting with no-wholesale workflow script policy. | `install-claude.sh:1199`, `package/package-contract.yaml:121` | profile/source split drift | 05 |
| WF-42 | Verification verdict defaults still write under `.claude` unless `HARNESS_VERDICT_FILE` is provided. | `agents/verification/verify-runtime.sh:630`, `agents/verification/verify-changes.sh:613` | runtime state in source checkout | 05 |

## Packaging Precision And Process Friction

| ID | Finding | Evidence | Risk | Phase |
| --- | --- | --- | --- | --- |
| WF-43 | Package denylist excludes broad path segments such as `fixtures`, `cache`, `logs`, which can drop legitimate future assets. | `package/build-package.mjs:88`, `tests/package-materialization.test.mjs:100` | silent asset omission | 06 |
| WF-44 | Install command surface is duplicated across README, package README, setup skill, shell, and PowerShell. | `README.md:153`, `package/README.md:34`, `skills/moonshot-relay-setup/SKILL.md:22` | operator confusion | 07 |
| WF-45 | Commit flow relies on manual path filtering instead of a machine-readable staging planner. | `skills/commit-moonshot/SKILL.md:42` | accidental staging | 07 |
| WF-46 | Review loop can pass with degraded note and weak reviewer identity/evidence shape. | `skills/moonshot-plan-writer/references/independent-review-loop.md:10` | review theater | 07 |
| WF-47 | Localization policy is claimed loosely; public docs lack manifest for `.ko.md` requirement level. | `README.md:12`, `docs/public/installer-usage.md:1` | doc drift noise | 07 |
| WF-48 | Small/read-only/docs-only work inherits complex plan/review/QA ceremony. | `skills/moonshot-plan-writer/assets/master-plan.template.md:35`, `templates/execution/QA_REPORT.template.md:146` | unnecessary overhead | 07 |
