# Legacy phase runner and harness adapters

- **ID**: `legacy-phase-runner-and-harness-adapters`
- **Domain**: `EXECUTION`
- **Family Status**: `DEPRECATED`
- **Summary**: Relay phase/lease/artifact/harness 구현과 실패 교훈을 삭제하지 않고 비교용 historical asset으로 보존한다.

## Subcapabilities (Decomplexification 단위)
- **`legacy-phase-runner`** [`DEPRECATED`]: 구 Relay phase 실행 및 임차 정책 (비교용)
- **`legacy-harness-adapters`** [`DEPRECATED`]: 아카이브된 과거 하네스 어댑터 (재도입 금지)

## 해결하는 문제
- 역사적 Relay phase 실행을 비교하고 실패 교훈을 추적하는 문제
- legacy migration 시 어떤 artifact/lease 계약이 있었는지 모르는 문제

## 해결하지 않는 문제
- 현재 Kernel task 실행
- legacy code를 다시 runtime에 로드하거나 자동 migration하는 것

## 권장 사용
- diff, archaeology와 regression 분석의 immutable historical reference로만 사용한다.
- 재도입이 필요하면 새 contract와 compatibility proof를 먼저 만든다.

## 금지 사용
- archive source를 현재 runtime path로 복사하지 않는다.
- phase runner를 Kernel step ledger와 병렬 authority로 실행하지 않는다.

## 재도입 가이드
- **권장 레이어**: separate compatibility experiment
- **트리거**: 새 요구가 legacy phase semantics를 명시적으로 다시 필요로 할 때
- **통합 지점**:
  - new task contract
  - compatibility adapter
  - isolated fixture
  - independent proof
- **위험 요소**:
  - duplicate state authority
  - stale security assumptions
  - runtime complexity regression
  - data migration
- **안전 가드레일**:
  - explicit opt-in
  - isolated path
  - no archive copy
  - new review and compatibility receipt
