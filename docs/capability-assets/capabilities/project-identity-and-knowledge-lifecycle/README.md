# Project identity and knowledge lifecycle

- **ID**: `project-identity-and-knowledge-lifecycle`
- **Domain**: `KNOWLEDGE`
- **Family Status**: `CORE`
- **Summary**: 프로젝트 identity, knowledge namespace와 revision lifecycle을 안전한 scope에 묶는다.

## Subcapabilities (Decomplexification 단위)
- **`project-identity-binding`** [`CORE`]: 프로젝트 고유 식별자 확정 및 네임스페이스 격리
- **`knowledge-lifecycle-authority`** [`CORE`]: 지식 레코드 개정, 대체, 저장 권위

## 해결하는 문제
- 동일 저장소의 remote/basename alias가 서로 다른 knowledge namespace를 만드는 문제
- 오래된 knowledge가 현재 프로젝트에 무검증으로 적용되는 문제

## 해결하지 않는 문제
- 지식 내용의 업무적 진실성
- provider별 외부 memory service의 availability

## 권장 사용
- 모든 knowledge operation 전에 canonical project identity와 worktree scope를 확인한다.
- revision, freshness, supersession을 lifecycle에 기록한다.

## 금지 사용
- basename이나 remote URL만으로 identity를 단정하지 않는다.
- candidate를 review/commit 없이 canonical knowledge로 승격하지 않는다.

## 재도입 가이드
- **권장 레이어**: project identity preflight and knowledge repository
- **트리거**: 새 knowledge source, alias migration 또는 cross-run reuse를 추가할 때
- **통합 지점**:
  - identity preflight
  - knowledge namespace
  - revision/freshness
  - supersession
- **위험 요소**:
  - 잘못된 프로젝트에 지식 적용
  - stale knowledge가 current source보다 우선
  - identity migration 중 data loss
- **안전 가드레일**:
  - canonical root + Git identity binding
  - fail-closed unresolved aliases
  - revision and freshness receipt
