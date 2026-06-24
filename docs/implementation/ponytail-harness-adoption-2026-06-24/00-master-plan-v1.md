# Ponytail Harness Adoption - Master Plan v1

## Scope Status

Status: complete-instruction-tier-only-live-adoption-skipped

This package plans how to evaluate and adopt `DietrichGebert/ponytail` in the Moonshot Relay development harness without replacing Moonshot Relay's existing runtime authority, verification gates, package boundaries, or live profile closeout rules.

## Objective

Apply Ponytail's minimal-correct-implementation discipline to Moonshot Relay development workflows as a governed harness capability.

The goal is not to make Moonshot Relay depend on Ponytail as completion authority. The goal is to add a small, auditable pressure against over-engineering while preserving required evidence, security, accessibility, trust-boundary validation, and runtime-state completion authority.

## External Source Snapshot

| Source | Observed role | Adoption implication |
|---|---|---|
| `https://github.com/DietrichGebert/ponytail` | Upstream repository, MIT-licensed, version observed as `4.8.1` in plugin/package metadata. | Must pin commit and license before vendoring or packaging. |
| `AGENTS.md` | Compact instruction-tier rules for agents that read project instructions. | Candidate for a Moonshot-specific guideline or review rubric, not direct root replacement. |
| `.codex-plugin/plugin.json` | Codex plugin manifest exposing `skills/` and `hooks/claude-codex-hooks.json`. | Candidate external plugin surface; requires hook and permission review before live profile use. |
| `skills/ponytail/SKILL.md` | Main minimalism skill with `lite/full/ultra` modes and safety exclusions. | Candidate source for an internal, narrower Moonshot "minimality gate" skill or rule. |
| `skills/ponytail-review/SKILL.md` | Over-engineering-focused diff review. | Candidate sidecar review perspective, separate from correctness/security reviews. |
| `hooks/claude-codex-hooks.json` | Claude/Codex lifecycle hooks using Node commands for activation and mode tracking. | Must remain disabled until hook execution, env vars, and profile interaction are tested. |
| `docs/agent-portability.md` | Adapter map across Codex, Claude Code, OpenCode, Pi, Gemini, and instruction-tier hosts. | Confirms thin-adapter pattern; Moonshot adoption should keep host adapters thin. |

The snapshot above is `observed_unpinned` until Phase 01 records `observedAt`, `observedRef`, `observedCommit`, `licenseEvidencePath`, and upstream file evidence in `source-intake/source-pin.json`.

## Current Moonshot Constraints

- Canonical source stays in tracked root-level source directories, not live `.claude/` or `.codex/` profiles.
- `runtime-state.sqlite` remains workflow authority for run status, blockers, and whole-plan completion decisions.
- `package/runtime-surface.json` currently allows only explicit public runtime skills.
- `skills.lock.json` and `scripts/skills-audit.mjs` are the current source-skill supply-chain guard.
- Live account-root/profile sync requires operational adoption closeout, package dry-run, doctor, lab, package/eval/test gates, and installed profile parity.
- External harnesses are reference inputs unless an explicit architecture or adoption decision promotes a bounded component.

## Non-Negotiables

- Do not paste Ponytail's root `AGENTS.md` into Moonshot Relay root instructions as an always-on override.
- Do not let "shortest diff" remove required evidence, tests, verification records, trust-boundary validation, security checks, accessibility, or data-loss error handling.
- Do not run or install upstream lifecycle hooks in live profiles before source pin, permission review, and isolated dry-run evidence exist.
- Do not expand `package/runtime-surface.json` with Ponytail-derived skills without explicit approval and doctor/skills-audit evidence.
- Do not import upstream benchmark claims as Moonshot Relay performance claims. Measure local impact with harness-lab or source-local before/after tasks.
- Do not treat Ponytail review as a replacement for correctness, security, architecture, or phase-runner closeout review.

## Plan Package Readiness

```yaml
planPackageReadiness:
  schemaVersion: 1
  status: drafted_preparation_ready_not_live_adoption_ready
  planRoot: docs/implementation/ponytail-harness-adoption-2026-06-24
  selectedMasterPlan: docs/implementation/ponytail-harness-adoption-2026-06-24/00-master-plan-v1.md
  selectedPhaseDocs:
    - docs/implementation/ponytail-harness-adoption-2026-06-24/01-source-intake-and-policy-mapping-v1.md
    - docs/implementation/ponytail-harness-adoption-2026-06-24/02-instruction-tier-poc-v1.md
    - docs/implementation/ponytail-harness-adoption-2026-06-24/03-skill-and-plugin-supply-chain-v1.md
    - docs/implementation/ponytail-harness-adoption-2026-06-24/04-runtime-package-adoption-gate-v1.md
    - docs/implementation/ponytail-harness-adoption-2026-06-24/05-validation-metrics-and-rollout-v1.md
  reviewArtifacts:
    - docs/implementation/ponytail-harness-adoption-2026-06-24/planning-loop/plan-quality-review-iter-01.yaml
    - docs/implementation/ponytail-harness-adoption-2026-06-24/planning-loop/plan-quality-review-iter-02.yaml
    - docs/implementation/ponytail-harness-adoption-2026-06-24/planning-loop/per-document-review-iter-02.yaml
  executionReadiness: preparation_only
  readinessDecision: "Phase 01 may run as read-only/source-pin intake. Live profile adoption remains blocked until Phase 04 and Phase 05 gates pass."
  graphReadiness: markdown_only_not_dag_validated
  executionAuthority: "This package is a Markdown plan package. It does not claim validated plan-graph execution readiness."
```

## Runner Contract

```yaml
runnerContract:
  mode: preparation_only
  activePhase: "01"
  runnablePhases:
    - "01"
  blockedPhases:
    - phase: "02"
      until:
        - "source-intake/source-pin.json"
        - "source-intake/policy-compatibility.md"
        - "source-intake/adoption-shape-decision.yaml"
    - phase: "03"
      until:
        - "execution/phase-02/HANDOFF.md"
        - "execution/phase-02/phase-decision.yaml"
    - phase: "04"
      until:
        - "phase-03/adoption-decision.yaml with requires_phase_04: true"
      skipWhen:
        - "phase-03/adoption-decision.yaml selects instruction_tier_only, user_managed_plugin_documented, or rejected"
    - phase: "05"
      until:
        - "execution/phase-05/local-evidence-report.md can be produced from prior branch evidence"
  phaseCloseoutRequiredForEveryExecutedPhase:
    - "execution/phase-XX/SCORECARD.md"
    - "execution/phase-XX/QA_REPORT.md"
    - "execution/phase-XX/HANDOFF.md"
    - "execution/phase-XX/phase-decision.yaml"
```

## Phase Index

| Phase | Title | Plan File | Depends On | Execution Readiness |
|---|---|---|---|---|
| 01 | Source Intake and Policy Mapping | `01-source-intake-and-policy-mapping-v1.md` | - | may run first |
| 02 | Instruction-Tier PoC | `02-instruction-tier-poc-v1.md` | 01 | source-only after source pin |
| 03 | Skill and Plugin Supply Chain | `03-skill-and-plugin-supply-chain-v1.md` | 01, 02 | blocked until adoption shape is selected |
| 04 | Runtime Package Adoption Gate | `04-runtime-package-adoption-gate-v1.md` | 03 | blocked until package policy is updated and reviewed |
| 05 | Validation, Metrics, and Rollout | `05-validation-metrics-and-rollout-v1.md` | 02, 03; 04 only for managed runtime/package adoption | blocked until local evidence exists |

## Phase Boundary Summary

| Phase | Primary Write Boundary | Conflict Boundary | Adoption Target |
|---|---|---|---|
| 01 | Plan package and optional source-pin manifest only | Must not modify runtime profiles, package payload, or upstream plugin install state | External-source intake only |
| 02 | Source-only guideline/rule/test candidate | Must not mutate runtime surface, skills lock, or live profiles | Instruction-tier PoC |
| 03 | Optional skill/supply-chain source and tests | Must not publish public runtime skill or install external hooks | Supply-chain decision |
| 04 | Package/runtime-surface, installer, doctor, rollback, and package tests only if explicitly approved | Must not perform live account-root/profile sync | Package adoption gate |
| 05 | Local validation artifacts/tests and optional finalized docs | Must not perform live install without explicit approval and closeout gates | Rollout decision |

## Adoption Strategy

| Stage | Target | Policy |
|---|---|---|
| Intake | `docs/implementation/**`, source pin manifest | Read-only external inspection plus local policy mapping. |
| PoC | `docs/public/guidelines/**` or narrow rules docs | Prefer instruction-tier guideline before plugin/hook adoption. |
| Optional skill | `skills/**`, `skills.lock.json`, tests | Only if the PoC shows a reusable Moonshot-specific skill is worth owning. |
| Optional plugin | external plugin install path, never direct package authority | Treat upstream plugin as user/profile opt-in unless package policy explicitly supports managed external plugins. |
| Live adoption | account-root/profile install | Requires full operational closeout and rollback plan. |

## Adoption Branch Matrix

| Branch | Phase 03 Decision | Phase 04 Requirement | Phase 05 Closeout Evidence |
|---|---|---|---|
| `instruction_tier_only` | `phase-03/adoption-decision.yaml` selects `instruction_tier_only`; no source skill is created. | Managed package/runtime adoption is skipped; `phase-04/runtime-surface-approval.md` is not required; `phase-04/runtime-adoption-skipped.md` records no `package/runtime-surface.json` diff. | `phase-05/adoption-skipped.md` or `phase-05/instruction-tier-rollout.md` records no live install and points to Phase 02 validation. |
| `moonshot_owned_skill` | `phase-03/adoption-decision.yaml` selects `moonshot_owned_skill` and names skill path, lock update, permissions, rollback steps. | Required. `phase-04/runtime-surface-approval.md` is required before public runtime-surface expansion; package dry-run evidence is required. | `phase-05/local-evidence-report.md`; live install only with `phase-05/live-rollout-approval.md` and `phase-05/installed-parity.json`. |
| `user_managed_plugin_documented` | `phase-03/adoption-decision.yaml` selects `user_managed_plugin_documented`; upstream plugin remains outside package authority. | Managed package/runtime adoption is skipped unless a separate approval changes package policy. | `phase-05/adoption-skipped.md` records external opt-in docs only and no live profile mutation. |
| `rejected` | `phase-03/adoption-decision.yaml` or Phase 05 evidence rejects adoption. | Skipped. | `phase-05/rejection-decision.md` records reason and residual backlog. |

## Source Traceability Matrix

| Req ID | Source | Requirement Summary | Phase | Acceptance Evidence | Evidence Artifact |
|---|---|---|---|---|---|
| PONY-REQ-01 | Ponytail ladder | Prefer YAGNI, existing code, stdlib/native/platform/dependency reuse before new code. | 02 | Moonshot-specific guideline/rubric exists and preserves required evidence rules. | `execution/phase-02/HANDOFF.md`, selected guideline/rule path, and `execution/phase-02/minimality-static-gate.txt` |
| PONY-REQ-02 | Ponytail safety exclusions | Never simplify away validation, error handling, security, accessibility, explicit asks, or real-world calibration. | 02, 05 | Tests/review checklist prove evidence and safety gates remain mandatory. | `execution/phase-02/QA_REPORT.md`, `execution/phase-05/local-evidence-report.md` |
| PONY-REQ-03 | Ponytail review skill | Add over-engineering review as an optional sidecar perspective. | 03, 05 | Review artifact distinguishes complexity-only findings from correctness/security findings. | `phase-03/adoption-decision.yaml`, `execution/phase-05/local-evidence-report.md` |
| PONY-REQ-04 | Codex plugin manifest/hooks | Codex integration uses skills plus lifecycle hooks. | 03, 04 | Hook permissions, env vars, and timeout behavior are reviewed before live use. | `source-intake/hook-inventory.md`, `phase-03/permission-review.md`, `phase-04/hook-smoke-report.md` if managed hooks are selected |
| PONY-REQ-05 | Moonshot package policy | Runtime skill surface is allowlist-only and live sync requires parity. | 04 | `doctor`, `skills-audit`, package dry-run, and profile parity gates pass before adoption. | `phase-04/runtime-surface-approval.md`, `phase-04/package-dry-run.json`, `phase-04/skills-audit.json`, `phase-05/installed-parity.json` if live adoption occurs |
| PONY-REQ-06 | Local impact | Upstream benchmark claims are not local authority. | 05 | Harness-lab or source-local eval captures before/after complexity and failure metrics. | `execution/phase-05/local-evidence-report.md` |

## Invalidation Matrix

| Change | Invalidates |
|---|---|
| Upstream Ponytail commit/version changes after source pin | license/hash review, vendored file checks, plugin hook review |
| Moonshot runtime-surface allowlist changes | doctor profile-surface parity, package dry-run, skills-audit result |
| Skill lock schema or lock file changes | supply-chain audit, permission review |
| Hook command/environment changes | isolated hook smoke, profile install dry-run, rollback procedure |
| Minimalism guideline wording changes | review rubric tests and safety-exclusion checks |

## Scenario-Specific Validation Gates

Instruction-tier only:

- `node scripts/doctor.mjs check --json`
- Mandatory Phase 02 static gate recorded in `execution/phase-02/minimality-static-gate.txt`.
- `package.json`, lockfiles, `skills.lock.json`, and `package/runtime-surface.json` remain unchanged or the diff is explicitly recorded as not applicable.

Moonshot-owned skill or managed runtime-surface adoption:

- `node scripts/doctor.mjs check --json`
- `node scripts/skills-audit.mjs audit --lock skills.lock.json --runtime-surface package/runtime-surface.json --json`
- `npm run test:package`
- `npm test`
- `node package/build-package.mjs --runtime all --dry-run --json`, captured as `phase-04/package-dry-run.json`.
- `phase-04/runtime-surface-approval.md` exists before `package/runtime-surface.json` changes.

Managed hooks:

- `phase-03/permission-review.md` records executable path, arguments, env vars, network use, filesystem writes, process lifetime, failure behavior, and policy fit.
- `phase-04/hook-smoke-report.md` covers normal run, timeout, missing Node, and denied environment cases before package adoption.

Live account-root/profile rollout:

- `npm run test:lab`
- `npm run test:eval`
- All managed-adoption gates above.
- `phase-05/live-rollout-approval.md` exists before install.
- `node scripts/install-account-root-harness.mjs --runtime all --source-root <repo> --moonshot-home <home> --claude-home <home> --codex-home <home> --json`
- Installed doctor and installer `profileSurfaceParity` are captured in `phase-05/installed-parity.json`.
- Runtime-state completion authority is either accepted with fresh evidence or explicitly marked `live_adoption_skipped` in `phase-05/final-decision.yaml`.

## Completion Rule

This plan is complete when the source pin, policy mapping, selected adoption shape, package/supply-chain changes, local validation evidence, rollback path, and live adoption decision are all recorded. If the selected adoption is instruction-tier only, Phase 04 live profile adoption may close as explicitly skipped with evidence that no runtime surface expansion occurred.

## Completion Closeout

Completed on 2026-06-24 as `instruction_tier_only`.

Accepted durable source changes:

- `docs/public/guidelines/minimal-correct-implementation.md`
- `docs/public/repository-layout.md`
- `docs/implementation/ponytail-harness-adoption-2026-06-24/**`

Rejected or skipped adoption surfaces:

- upstream Ponytail plugin install
- upstream executable hooks
- Moonshot-owned Ponytail skill
- `skills.lock.json` regeneration for this adoption
- `package/runtime-surface.json` expansion
- live account-root/profile mutation

Final evidence:

- `phase-05/final-decision.yaml`
- `phase-05/adoption-skipped.md`
- `execution/phase-05/local-evidence-report.md`
- `execution/phase-05/QA_REPORT.md`

Runtime-state completion authority:

- run id: `ponytail-harness-adoption-20260624-final`
- decision id: `a95f20ce-0f73-4ccb-af0c-83b47f567573`
- status: `accepted`
