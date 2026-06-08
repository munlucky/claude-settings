---
name: moonshot-architecture
description: PRD 또는 기존 코드베이스 목표를 구현 계획 전의 근거 기반 아키텍처 설계 패키지로 변환할 때 사용합니다.
layer: orchestrator
loads:
  - architecture-design-artifacts
  - project-knowledge-context
  - requirements-traceability
  - verdict-summaries
deepReferences:
  - references/architecture-design-contract.md
  - references/context-safety.md
  - references/handoff-boundaries.md
outputArtifacts:
  - ARCHITECTURE_BRIEF.md
  - ASR_CATALOG.md
  - DOMAIN_MODEL.md
  - ARCHITECTURE_OPTIONS.md
  - TRADEOFF_ANALYSIS.md
  - C4/*.md
  - ADR/*.md
  - ARCHITECTURE_REVIEW.md
  - SPEC.md
  - SPEC_DELTA.md
  - PLAN.md
  - TRACEABILITY_MATRIX.md
triggers:
  - "moonshot architecture"
  - "PRD to architecture"
  - "architecture design"
  - "architecture recovery"
  - "architecture fit gap"
---

# Moonshot Architecture

## 역할

제품 정의와 구현 실행 사이에서 근거 기반 아키텍처 설계 패키지를 만듭니다.

구현을 바로 시작하기 전에 ASR, 품질속성, 도메인/기능 경계, 아키텍처 옵션, ADR, C4, traceability가 필요한 작업에서 사용합니다.

## 모드

- `greenfield_prd`: PRD를 입력으로 받아 구현 계획 전에 아키텍처 결정을 만듭니다.
- `brownfield_codebase`: 현재 코드베이스 구조를 근거로 복구한 뒤 fit-gap과 migration guidance를 만듭니다.
- `hybrid_prd_plus_existing_repo`: PRD 정규화와 Brownfield 제약을 함께 반영하고 `SPEC_DELTA`를 우선합니다.
- `meta_harness_design`: Moonshot Relay 하네스 변경 설계를 만들고 `moonshot-plan-writer`로 넘깁니다.

## 흐름

1. 모드를 분류합니다.
2. 현재 stage에 맞는 `projectKnowledgeContext`를 만들고 status metadata만 보존합니다.
3. 가능하면 `scripts/architecture-context-build.mjs`로 compact architecture context를 만듭니다.
4. 요구사항을 `REQUIREMENT_INVENTORY.md`로 정규화합니다.
5. ASR과 품질속성 시나리오를 추출합니다.
6. 도메인 모델, capability map, data/integration flow를 만듭니다.
7. Brownfield/Hybrid 작업에서는 repository evidence로 현재 아키텍처와 기존 제약을 복구합니다.
8. non-trivial 작업에는 최소 2개 architecture option을 만듭니다.
9. trade-off review를 실행합니다.
10. 중요한 결정은 C4 model과 ADR로 기록합니다.
11. `SPEC.md` 또는 `SPEC_DELTA.md`를 만듭니다.
12. `PLAN.md`와 `TRACEABILITY_MATRIX.md`를 만듭니다.
13. `architecture-gate-reviewer`를 실행하고 `ARCHITECTURE_REVIEW.md`를 작성합니다.
14. owned/read-only/staged paths와 verification signal을 명시해 `moonshot-plan-writer`, `moonshot-orchestrator`, `moonshot-phase-runner` 중 적절한 대상으로 handoff합니다.

## Internal Stage Owners

`moonshot-architecture`는 다음 source-only internal skills를 조합합니다. 별도 controlled adoption phase가 runtime surface를 변경하기 전까지 profile-local public runtime discovery에는 노출하지 않습니다.

| Stage | Internal Skill | Primary Artifacts |
|---|---|---|
| ASR extraction | `asr-extractor` | `ASR_CATALOG.md`, `QUALITY_ATTRIBUTE_SCENARIOS.md` |
| Option generation | `architecture-option-generator` | `ARCHITECTURE_OPTIONS.md`, `CAPABILITY_MAP.md` |
| Trade-off review | `architecture-tradeoff-reviewer` | `TRADEOFF_ANALYSIS.md`, ADR inputs |
| C4 and ADR writing | `adr-c4-writer` | `C4/*.md`, `ADR/*.md` |
| Architecture gate review | `architecture-gate-reviewer` | `ARCHITECTURE_REVIEW.md`, handoff readiness |
| Brownfield recovery | `codebase-architecture-recovery` | `CURRENT_ARCHITECTURE.md`, `PRD_FIT_GAP.md`, `IMPACT_MAP.md`, `SPEC_DELTA.md` |

## Hard Stops

- non-trivial PRD에서 ASR extraction을 생략하지 않습니다.
- `greenfield_prd` mode에서는 Brownfield current-architecture evidence를 요구하지 않습니다.
- 중요한 결정의 ADR 없이 architecture readiness를 주장하지 않습니다.
- accepted requirement가 quality scenario, ASR, ADR, task owner, verification signal로 이어지기 전에는 Greenfield implementation `PLAN.md`를 만들지 않습니다.
- accepted requirement에서 implementation owner와 verification signal까지 이어지는 traceability 없이 구현으로 넘기지 않습니다.
- `architecture-gate-reviewer` readiness evidence 없이 구현으로 넘기지 않습니다.
- Brownfield 현재 아키텍처를 repository evidence 없이 발명하지 않습니다.
- raw MemoryGraph record, KG edge dump, ontology dump, runtime log, transcript, browser scrape, secret-like string을 prompt나 산출물에 넣지 않습니다.
- architecture design 중 live `.claude/**`, `.codex/**`, account-root state, runtime profile을 mutate하지 않습니다.
- `moonshot-phase-runner` completion authority나 `scripts/runtime-state.mjs assess-completion`을 대체하지 않습니다.

## Required Evidence

- mode classification과 input source path.
- architecture package path.
- requirement inventory와 ASR catalog.
- domain/capability model 또는 Brownfield current architecture evidence.
- architecture option comparison과 trade-off review.
- 주요 결정에 대한 ADR/C4 output.
- Architecture gate review status.
- requirement ID를 implementation owner와 verification signal로 연결한 traceability matrix.
- handoff target과 선택 이유.

## Public Surface Boundary

`moonshot-architecture`는 public runtime entrypoint입니다. ASR extraction, option generation, trade-off review, C4/ADR writing, gate review, Brownfield recovery용 supporting skill은 별도 controlled adoption phase가 runtime surface 변경을 승인하기 전까지 internal source skill로 남깁니다.

Public guidelines는 durable policy를 `docs/public/guidelines/` 아래에 mirror합니다. 실행 가능한 `deepReferences`는 package materialization이 profile-local public guideline path 없이 해석할 수 있도록 skill-local reference로 유지합니다.
