# Retrospective and regression learning

- **ID**: `retrospective-and-regression-learning`
- **Domain**: `KNOWLEDGE`
- **Status**: `OPTIONAL`
- **Summary**: 실패·회고 signal을 수집하고 regression candidate로 만들되 명시적 review 전에는 authority로 승격하지 않는다.

## 해결하는 문제
- 반복 실패가 다음 작업에서 재현되는 문제
- 실패 signal을 구조화된 regression test/개선 proposal로 잃는 문제

## 해결하지 않는 문제
- 자동으로 product fix를 적용하는 것
- review 없이 knowledge나 runtime policy를 바꾸는 것

## 권장 사용
- 실패 symptom, evidence, root cause와 regression candidate를 수집한다.
- proposal은 review와 명시적 commit 전까지 advisory로 유지한다.

## 금지 사용
- 자동 promotion을 completion이나 policy update로 해석하지 않는다.
- 민감한 raw trace를 redaction 없이 보존하지 않는다.

## 재도입 가이드
- **권장 레이어**: advisory retrospective and regression proposal surface
- **트리거**: 반복 실패, regression 또는 workflow improvement signal을 분석할 때
- **통합 지점**:
  - failure receipt
  - redaction
  - candidate extraction
  - review
  - regression test
- **위험 요소**:
  - secret leakage
  - false root cause
  - silent policy mutation
  - duplicate candidate noise
- **안전 가드레일**:
  - redaction
  - evidence refs
  - advisory-only
  - explicit review/commit
  - regression proof
