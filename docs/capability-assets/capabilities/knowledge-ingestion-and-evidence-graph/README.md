# Knowledge ingestion and evidence graph

- **ID**: `knowledge-ingestion-and-evidence-graph`
- **Domain**: `KNOWLEDGE`
- **Status**: `CORE`
- **Summary**: 외부·과거 signal을 redact, normalize, deduplicate하고 evidence-bound knowledge candidate로 만든다.

## 해결하는 문제
- 서로 다른 source에서 온 signal을 검증 없이 memory로 승격하는 문제
- 중복·충돌·민감 데이터가 knowledge store로 유입되는 문제

## 해결하지 않는 문제
- candidate 내용의 도메인 truth를 자동 판정하는 것
- review/commit authority를 대체하는 것

## 권장 사용
- source provenance, evidence refs와 redaction 결과를 candidate에 바인딩한다.
- normalize → deduplicate → conflict → review 순서를 보존한다.

## 금지 사용
- raw payload를 canonical knowledge로 저장하지 않는다.
- 자동 candidate를 silent promotion하지 않는다.

## 재도입 가이드
- **권장 레이어**: project-scoped knowledge ingestion
- **트리거**: 새 source, retrospective signal 또는 cross-run evidence를 유입할 때
- **통합 지점**:
  - redaction
  - normalization
  - deduplication
  - conflict
  - review
  - commit
- **위험 요소**:
  - secret/raw payload leakage
  - duplicate knowledge
  - wrong project namespace
  - silent promotion
- **안전 가드레일**:
  - schema and redaction gate
  - evidence-bound candidate
  - explicit review/commit
  - freshness and supersession
