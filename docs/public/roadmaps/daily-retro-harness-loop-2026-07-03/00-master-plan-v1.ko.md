# Daily Retro Harness Loop - 구현 마스터 플랜 v1

## Scope Status

Status: implementation-ready-design-plan

이 문서는 `moonshot-relay`에 작업 종료 후 회고 데이터를 축적하고, 기간별 회고로 하네스 개선 후보를 만드는 advisory loop를 추가하기 위한 구현 계획이다.

## Objective

다음 흐름을 구현한다.

```text
작업 closeout evidence
  -> retro collect
  -> collect.json
  -> retro import
  -> retro inbox
  -> daily retro
  -> improvement candidates
  -> proposal / issue draft
```

## Non-Goals

- retro 결과로 verify/score/closeout/promotion 상태를 바꾸지 않는다.
- GitHub Issue를 자동 생성하지 않는다.
- runtime retro data를 canonical source로 커밋하지 않는다.
- `harness-history`의 기존 lab history 계약을 초기 구현에서 바꾸지 않는다.
- `.claude/**`, `.codex/**`, account-root installed profile을 이 계획의 source implementation 단계에서 바꾸지 않는다.

## Plan Package Readiness

```yaml
planPackageReadiness:
  schemaVersion: 1
  status: "source-roadmap-ready-for-phase-runner"
  projectId: "munlucky-moonshot-relay"
  sourceRoadmapRoot: "docs/public/roadmaps/daily-retro-harness-loop-2026-07-03"
  architecturePackage:
    mode: "meta_harness_design"
    path: "docs/public/roadmaps/daily-retro-harness-loop-2026-07-03"
    handoff: "docs/public/roadmaps/daily-retro-harness-loop-2026-07-03/ARCHITECTURE_HANDOFF.json"
    reviewStatus: "ready_after_independent_review"
  executionPackageRoot: "${MOONSHOT_RELAY_HOME:-~/.moonshot-relay}/state/projects/munlucky-moonshot-relay/planning/packages/daily-retro-harness-loop-2026-07-03"
  selectedMasterPlan: "00-master-plan-v1.ko.md"
  selectedPhaseDocs:
    - "01-retro-contract-and-docs-v1.ko.md"
    - "02-retro-store-import-v1.ko.md"
    - "03-daily-analysis-v1.ko.md"
    - "04-proposal-and-issue-draft-v1.ko.md"
    - "05-cli-skill-docs-adoption-v1.ko.md"
  reviewArtifacts:
    - "planning-loop/plan-quality-review-iter-01.yaml"
  readinessDecision: "runnable_after_source_branch_creation"
```

## Surface Classification

| Surface | Classification | Plan |
|---|---|---|
| `schemas/retro.*` | `source_only` | Add schema contracts and tests. |
| `templates/retro/**` | `source_only` | Add markdown/json templates. |
| `tools/retro/**` | `source_only` | Add collect, import, daily, propose, and issue-draft commands. |
| `bin/moonshot-relay.mjs` | `source_only` | Add `retro` dispatch without changing existing commands. |
| `package.json` scripts | `source_only` | Add `test:retro`; include retro tests in `npm test`. |
| `docs/public/**` and `skills/moonshot-retro/**` | `source_only` | Add public usage and skill routing docs. |
| Package payload definitions | `package_runtime_payload` | Ensure source files package correctly and runtime retro state is excluded. |
| Account-root retro output | `data_or_state_migration` design only | Generated at runtime, not committed. |
| Installed profiles | `installed_profile_or_account_root` deferred | Separate adoption phase after source tests. |
| GitHub Issues | `external_deployment_or_service` deferred | Local issue draft only. |

## Policy Sources

- `AGENTS.md`
- `schemas/verification.contract.yaml`
- `docs/public/repository-layout.md`
- `docs/public/reference/runtime-skill-surface.md`
- `package.json`
- `tools/harness-lab/harness-history.mjs`
- `schemas/improvement-candidate-v1.schema.json`
- `schemas/improvement-proposal.schema.json`

## Phase Runner Execution Index

| Phase | Title | Plan File | Depends On | Parallel |
|---|---|---|---|---|
| 01 | Retro Contract and Docs | `01-retro-contract-and-docs-v1.ko.md` | - | no |
| 02 | Retro Store and Import | `02-retro-store-import-v1.ko.md` | 01 | no |
| 03 | Daily Analysis | `03-daily-analysis-v1.ko.md` | 02 | no |
| 04 | Proposal and Issue Draft | `04-proposal-and-issue-draft-v1.ko.md` | 03 | no |
| 05 | CLI, Skill, Docs, Package Adoption Prep | `05-cli-skill-docs-adoption-v1.ko.md` | 04 | no |

## Required Evidence Slots

- schema validation tests
- fixture-based CLI tests
- redaction negative tests
- no-promotion-authority tests
- package payload exclusion tests
- `node bin/moonshot-relay.mjs retro --help`
- `npm run test:retro`
- `npm test`
- independent review artifact with accepted/rejected findings
- architecture handoff artifact at `ARCHITECTURE_HANDOFF.json`

## Closeout Authority

Source implementation completion requires fresh command output for `npm run test:retro`, `npm test`, and CLI smoke checks. Runtime/profile adoption requires a separate install/package parity closeout and is not implied by this plan.
