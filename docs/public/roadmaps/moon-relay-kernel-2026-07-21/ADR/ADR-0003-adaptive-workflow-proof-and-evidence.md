# ADR-0003 Adaptive Workflow, Proof, and Evidence

## Status

Accepted

## Context

모든 작업에 동일한 계획·리뷰·산출물 체인을 적용하면 단순 작업의 비용이 과도해진다. 반대로 경량 경로만 두면 고위험 변경의 독립 검토와 릴리스 추적성이 약화된다.

## Decision

- 워크플로우는 `FRAME → SHAPE → SLICE → SCHEDULE → EXECUTE → PROVE → CLOSE`를 사용한다.
- SHAPE와 SLICE는 작업이 비자명하거나 복합적일 때만 수행한다.
- 질문은 결과·보안·데이터·외부 계약을 바꾸는 불확실성에만 사용한다.
- proof tier는 T0 deterministic, T1 compact, T2 dual, T3 full로 분류한다.
- evidence tier는 E0 RUN_SUMMARY, E1 TASK_CONTRACT+QA_REPORT, E2 RELEASE_EVIDENCE+slice graph로 분류한다.
- security, data, schema, public contract 변경은 낮은 proof tier로 내려갈 수 없는 hard floor다.
- completion은 선택된 proof tier의 fresh evidence와 runtime decision을 모두 요구한다.

## Consequences

- 작은 작업의 latency와 artifact 수가 감소한다.
- 고위험 작업은 독립 review와 release evidence를 유지한다.
- risk classifier의 오분류를 막는 평가와 receipt가 필요하다.

## Rejected Alternatives

- 모든 작업에 고정 3축 리뷰.
- 모든 작업에 PRD·SPEC·ADR·PLAN 생성.
- 모든 단계마다 새 에이전트 생성.
- 특정 context-window 사용률을 보편 임계값으로 하드코딩.