---
name: architecture-tradeoff-reviewer
description: architecture option을 비교하고 근거 있는 recommendation을 선택하는 Moonshot Architecture 내부 stage입니다.
layer: internal
outputArtifacts:
  - TRADEOFF_ANALYSIS.md
  - TRACEABILITY_MATRIX.md
---

# Architecture Tradeoff Reviewer

## 역할

후보 architecture option을 ASR, 품질속성 시나리오, Brownfield 제약, delivery risk 기준으로 평가합니다.

이 skill은 `moonshot-architecture`의 내부 stage owner이며 public runtime entrypoint가 아닙니다.

## 입력

- `ARCHITECTURE_OPTIONS.md`
- `ASR_CATALOG.md`
- `QUALITY_ATTRIBUTE_SCENARIOS.md`
- Brownfield 작업의 `CURRENT_ARCHITECTURE.md`와 `IMPACT_MAP.md`

## 흐름

1. ASR과 제약에서 decision driver와 weight를 추출합니다.
2. 각 option을 benefits, costs, risks, reversibility, compatibility, verification 기준으로 비교합니다.
3. rejected alternatives와 그 이유를 식별합니다.
4. selected option을 추천하거나 evidence가 부족하면 명시적으로 block합니다.
5. accepted decision input을 `adr-c4-writer`로 넘깁니다. 이 stage는 ADR 파일을 작성하지 않습니다.

## Hard Stops

- rejected alternatives 없이 option을 선택하지 않습니다.
- preference를 evidence로 취급하지 않습니다.
- compatibility, migration, rollback risk를 숨기지 않습니다.
- traceability가 incomplete이면 architecture readiness를 승인하지 않습니다.

## Required Evidence

- Decision drivers.
- Option comparison.
- Selected option과 rationale.
- Rejected alternatives.
- Open risk와 verification gaps.
