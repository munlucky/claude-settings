# 스킬 아키텍처 재정비 준비 명세

Last-Reviewed: 2026-03-27

## 목적

스킬, 에이전트, 규칙, 런타임 어댑터를 수정하기 전에 필요한 모든 단계를 정의한다.

이 문서는 변경 게이트 직전에서 끝난다.
실제 구현은 의도적으로 범위 밖이다.

## Phase 맵

### Phase 0. 문제 정의 고정

목표:
- 해결하려는 문제를 먼저 고정해 해법이 흔들리지 않게 한다

작업:
- 목표가 전면 교체가 아니라 아키텍처 재정비임을 고정
- 대형 작업 진입점이 `moonshot-phase-runner`임을 고정
- 강한 이유가 없는 한 마이크로스킬을 유지한다는 원칙을 고정

산출물:
- 명시적 문제 정의
- 명시적 비목표

종료 조건:
- 작업 목적에 대한 모호함이 남지 않는다

### Phase 1. 현재 시스템 인벤토리 작성

목표:
- 현재 자산 목록을 완전하게 만든다

작업:
- `.claude/skills/` 아래 스킬 전수 조사
- `.claude/agents/` 아래 에이전트 전수 조사
- 문서에서 참조하는 bundle, gate, runner, execution adapter 조사
- bundle 정의와 실제 파일 사이의 드리프트 확인

산출물:
- `inventory.md`

종료 조건:
- 참조된 모든 워크플로우 자산이 `존재` 또는 `누락`으로 판정된다

### Phase 2. Tier 모델 정의

목표:
- 권위 있는 경계 모델을 하나 만든다

작업:
- 각 자산을 아래 중 하나에만 배정한다
  - public entrypoint
  - composition/control
  - micro-skill
  - internal adapter
- tier 간 허용 호출 방향을 정의한다
- 어떤 tier가 사용자 노출인지, 어떤 tier가 내부 전용인지 정의한다

산출물:
- `inventory.md` 내 tier 분류 섹션

종료 조건:
- 미배정 자산이 없다

### Phase 3. 책임 중복 평가

목표:
- 유용한 마이크로스킬은 보존하면서 중복만 찾아낸다

작업:
- trigger surface, 입력, 출력, 호출 빈도로 자산을 비교한다
- 진짜 중복과 건강한 조합을 구분한다
- 경계가 애매한 지점을 표시한다. 예:
  - 유사한 planning signal을 만드는 analyzer 다수
  - entrypoint처럼 보이는 execution skill 다수
  - gate 순서가 명확하지 않은 verification 계층

산출물:
- `inventory.md` 내 overlap 메모

종료 조건:
- 모든 중복 후보에 대해 아래 중 하나의 처리 방향이 있다
  - 분리 유지
  - bundle 뒤로 숨김
  - 추후 병합
  - 추후 폐기

### Phase 4. 자산 분류

목표:
- 현재 자산 전체에 대한 의사결정 매트릭스를 만든다

작업:
- 각 자산에 하나의 결정을 부여한다
  - `keep`
  - `merge_candidate`
  - `retire_candidate`
  - `improve`
- 결정 근거를 기록한다
- 의존성이나 migration risk를 기록한다

산출물:
- `inventory.md` 내 decision matrix

종료 조건:
- 현재 스킬과 에이전트 전부가 정확히 하나의 결정을 가진다

### Phase 5. 미래 호출 표면 설계

목표:
- 사람이 시스템에 진입하는 방식을 단순화한다

작업:
- public entrypoint 정책을 정의한다
- 아래 사용 조건을 정의한다
  - `product-orchestrator`
  - `moonshot-phase-runner`
  - `moonshot-orchestrator`
- 사용자가 더 이상 직접 호출하지 않아야 할 스킬을 선언한다
- 내부 구현 세부사항으로 남길 컴포넌트를 선언한다

산출물:
- `inventory.md` 내 invocation policy

종료 조건:
- large, medium, small 작업마다 진입 규칙이 모호하지 않다

### Phase 6. Bundle 및 실행 계약 정합화

목표:
- 조합 메타데이터와 실제 상태를 일치시킨다

작업:
- bundle 정의와 실제 스킬을 비교한다
- 죽은 참조와 숨은 의존성을 찾는다
- bridge artifact와 verification gate가 새 entry 모델과 맞는지 확인한다

산출물:
- `inventory.md` 내 reconciliation 섹션

종료 조건:
- 모든 bundle/file 불일치가 문서화된다

### Phase 7. 변경 패키지 준비

목표:
- 구현을 안전하고 검토 가능하게 만든다

작업:
- `merge_candidate`, `retire_candidate`별 migration note 작성
- 첫 구현 패스에서 바뀔 파일 집합 정의
- 롤백 경계 정의
- 수정 후 성공 판정 방식을 정의

산출물:
- `change-package.md`

종료 조건:
- 첫 구현 패스를 제한된 파일 집합으로 설명할 수 있다

### Phase 8. Ready For Change Gate

목표:
- 문서 패키지가 일관되기 전까지 코드 변경을 막는다

체크리스트:
- inventory complete
- tier model complete
- decision matrix complete
- invocation policy complete
- bundle drift documented
- migration notes written
- rollback boundaries declared

결과:
- 전부 통과면 구현 시작 가능
- 하나라도 실패면 문서화 단계 유지

## 아티팩트 계약

준비 패키지는 아래 파일을 포함해야 한다.
- `context.md`
- `specification.md`
- `inventory.md`
- `change-package.md`

## 규칙

- Phase 0부터 8까지는 런타임 자산을 수정하지 않는다
- 준비 단계에서는 삭제를 하지 않는다
- 확신이 낮은 직관을 아키텍처 결정처럼 취급하지 않는다
- 불확실성은 숨기지 말고 명시적으로 기록한다

## 첫 구현 경계

첫 구현 패스는 보통 아래만 건드리는 것이 좋다.
- classification metadata
- bundle 정의
- 문서 참조

처음부터 아래로 시작하면 안 된다.
- 대규모 rename
- 파일 삭제
- installer 변경
- runtime dispatch rewrite
