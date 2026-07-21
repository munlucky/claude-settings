# ADR-0003 Risk-Adaptive Proof and Evidence

## Status

Accepted

## Context

모든 변경에 Spec, Standards, Complexity 리뷰를 각각 독립 실행하면 단순 작업의 비용이 과도해진다. 반대로 단일 통합 리뷰만 사용하면 고위험 변경에서 한 관점이 다른 관점을 가릴 수 있다. 기존 Relay의 추적성을 모두 제거하면 장기 작업과 릴리스 승인 근거가 사라진다.

## Decision

- Proof Pipeline은 T0~T3 위험 등급으로 조정한다.
  - T0: 결정론적 검사만
  - T1: 단일 compact reviewer
  - T2: Spec / Standards+Complexity 독립 2축
  - T3: Spec, Standards, Complexity와 조건부 Security/Browser/Architecture
- 위험도는 LOC가 아니라 security boundary, data impact, public contract, schema, dependency, blast radius, reversibility, coverage, novelty로 판정한다.
- Evidence Pack은 E0~E2로 조정한다.
  - E0: RUN_SUMMARY
  - E1: TASK_CONTRACT, QA_REPORT, RUN_SUMMARY
  - E2: TASK_CONTRACT, SLICE_GRAPH, SPRINT_CONTRACT, QA_REPORT, RELEASE_EVIDENCE, 조건부 HANDOFF
- accepted completion은 fresh verification과 SQLite completion authority가 소유한다.
- 불명확한 위험은 한 단계 높은 tier로 보수적으로 승격한다.

## Consequences

- 저위험 작업의 토큰과 지연을 줄인다.
- 고위험 작업은 독립된 검토 관점을 유지한다.
- risk classifier와 tier selection receipt가 필요하다.
- A/B eval로 tier 임계값을 보정해야 한다.

## Rejected Alternatives

- 모든 작업의 고정 3축 리뷰
- 모든 작업의 전체 PRD/SPEC/ADR/PLAN 생성
- 단일 reviewer만 사용
- 문서 존재 또는 모델 주장만으로 completion 인정
