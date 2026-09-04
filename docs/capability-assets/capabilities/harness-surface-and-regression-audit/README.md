# Harness surface and regression audit

- **ID**: `harness-surface-and-regression-audit`
- **Domain**: `TRUST`
- **Status**: `REFERENCE`
- **Summary**: tracked surface, tests, budget와 regression signal을 진단해 검증 범위 drift를 드러낸다.

## 해결하는 문제
- 새 테스트가 실행 목록에서 빠지는 문제
- harness surface가 baseline을 넘어도 발견하지 못하는 문제
- 검증 증거의 범위가 조용히 축소되는 문제

## 해결하지 않는 문제
- 테스트 자체가 올바른지 보장하는 것
- Kernel completion gate를 대체하는 것

## 권장 사용
- 변경 전후 tracked surface와 test registration을 report/check한다.
- budget baseline 변경은 실제 clean baseline과 이유를 남긴다.

## 금지 사용
- surface report pass를 제품 기능 pass로 해석하지 않는다.
- budget을 낮춰 regression을 숨기지 않는다.

## 재도입 가이드
- **권장 레이어**: read-only verification/reporting plane
- **트리거**: harness test, package surface 또는 baseline growth를 변경할 때
- **통합 지점**:
  - surface report
  - test registration
  - budget config
  - regression test
- **위험 요소**:
  - baseline gaming
  - unregistered test omission
  - diagnostic output mistaken for authority
- **안전 가드레일**:
  - clean baseline measurement
  - fail-closed invalid config
  - separate completion evidence
