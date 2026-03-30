# skills.sh 워크플로우 정렬 컨텍스트

Last-Reviewed: 2026-03-27

## 목표

`skills.sh`의 유용한 워크플로우 패턴을 이 저장소에 맞게 흡수하되, 기존 Moonshot 자산을 통째로 갈아엎지 않는 안전한 개선 준비 패키지를 만든다.

## 작업 가설

핵심 문제는 개별 스킬이 부족한 것이 아니다.

핵심 문제는 end-to-end 워크플로우가 아직 여러 규칙, 가이드, 마이크로스킬에 분산되어 있다는 점이다.

- planning은 강하다
- verification은 강하다
- entrypoint는 대체로 정리되어 있다
- review cadence, isolation setup, finish/handoff는 독립된 단계로 덜 선명하다

`skills.sh`의 강점은 워크플로우를 눈에 보이는 단계 구조로 만든다는 데 있다.

- plan
- isolate
- execute
- review
- verify
- finish

이 저장소는 외부 스킬을 직접 들여오기보다, 그 구조를 빌려와 discoverability, bundle 경계, skill metadata를 정리하는 쪽이 맞다.

## 왜 필요한가

최근 로컬 분석만으로도 이 저장소는 보존할 구조가 충분하다는 점은 확인됐다.

하지만 워크플로우 전체 개선에 들어가기 전에 아직 필요한 것이 있다.

- stage 기반 skill workflow를 외부에서는 어떻게 제시하는지에 대한 벤치마크
- `skills.sh` 패턴과 현재 로컬 스킬 사이의 직접 매핑
- 런타임 churn 없이 워크플로우 가시성을 높일 1차 변경 패키지

## 범위 포함

- 선정한 `skills.sh` 워크플로우 스킬을 벤치마크하고 재사용 가능한 운영 패턴 추출
- 현재 entrypoint, bundle, gate, utility를 단일 stage 모델로 재배치
- 어떤 스킬을 유지하고, 어떤 스킬의 설명/위치를 조정할지 정의
- 문서, 규칙, 스킬 메타데이터 중심의 1차 구현 범위 정의

## 범위 제외

- 외부 skill repository 직접 도입
- 기존 Moonshot entrypoint 교체
- 현재 스킬 대량 삭제 또는 일괄 rename
- 준비 단계에서 runtime dispatch 또는 shell adapter 수정
- 설치 동작 재작성

## 제약

- 공개 1차 entrypoint 3개는 유지한다.
  - `product-orchestrator`
  - `moonshot-phase-runner`
  - `moonshot-orchestrator`
- 새로운 공개 surface를 늘리기보다 기존 스킬 개선을 우선한다.
- 이미 가치가 분명한 repo-specific 자산은 보존한다.
- 새 bundle 또는 wrapper가 추가되더라도 사용자 관점의 복잡도는 줄어야 한다.

## 필수 산출물

이 준비 패키지는 다음 파일을 포함해야 한다.

- `context.md`
- `benchmark.md`
- `specification.md`
- `change-package.md`

## Ready For Change

아래 조건이 모두 참일 때만 구현 단계로 넘어간다.

1. `skills.sh` 벤치마크가 저장소에 적용 가능한 명시적 패턴으로 정리되어 있다.
2. 목표 워크플로우 각 단계에 대한 로컬 owner가 선언되어 있다.
3. 갭이 막연한 희망이 아니라 `existing 개선`, `re-bundle`, `wrapper 추가` 중 하나로 표현되어 있다.
4. 1차 구현 범위가 문서, 규칙, 메타데이터로 제한되어 있고, 더 큰 범위는 후속 검토에서만 열린다.
5. verification/completion 규율은 현재 기준보다 느슨해지지 않는다.
