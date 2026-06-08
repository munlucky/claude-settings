---
name: architecture-option-generator
description: ASR, 제약, 현재 근거에서 architecture option을 생성하는 Moonshot Architecture 내부 stage입니다.
layer: internal
outputArtifacts:
  - ARCHITECTURE_OPTIONS.md
  - CAPABILITY_MAP.md
  - TRACEABILITY_MATRIX.md
---

# Architecture Option Generator

## 역할

ASR, 제약, mode별 근거에 대응하는 실행 가능한 architecture option을 만듭니다.

이 skill은 `moonshot-architecture`의 내부 stage owner이며 public runtime entrypoint가 아닙니다.

## 입력

- `ASR_CATALOG.md`
- `QUALITY_ATTRIBUTE_SCENARIOS.md`
- `DOMAIN_MODEL.md`와 `CAPABILITY_MAP.md`
- `brownfield_codebase` 또는 `hybrid_prd_plus_existing_repo` mode의 Brownfield evidence

## 흐름

1. ASR을 architectural force와 affected capability 기준으로 묶습니다.
2. non-trivial 작업에는 의미 있는 option을 최소 2개 생성합니다.
3. 각 option의 dependencies, reversibility, migration cost, operational impact, verification signal을 적습니다.
4. 모든 option을 requirement ID와 ASR ID에 연결합니다.
5. ADR 작성 전에 trade-off review가 필요한 gap을 식별합니다.

## Hard Stops

- non-trivial architecture work에서 option 하나만 제시하지 않습니다.
- current architecture evidence 없이 Brownfield 변경을 제안하지 않습니다.
- 새로움보다 구현 가능한 제약을 우선합니다.
- verification signal 없는 option을 넘기지 않습니다.

## Required Evidence

- Option IDs.
- Requirement와 ASR links.
- Benefits, costs, risks, dependencies, reversibility notes.
- 각 option의 verification signal.
