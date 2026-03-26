# 스킬 아키텍처 재정비 변경 패키지

Last-Reviewed: 2026-03-27

## 상태

문서와 스킬 메타데이터 기준의 정리 패스는 완료됐다.
스크립트나 런타임 디스패치 재작성은 필요하지 않았다.

## 첫 구현 패스

목표:
- 주요 실행 의미를 바꾸지 않고 아키텍처를 읽히게 만든다

대상 파일:
- `.claude/docs/guidelines/skill-composition.md`
- `.claude/docs/tasks/skill-architecture-rework/*`
- entrypoint 문서 정렬이 필요할 때만 `README.md`
- 공개/내부 상태 선언이 필요한 일부 `SKILL.md`

허용 변경:
- stale reference 수정
- 공개 진입점 명시
- 내부 전용 실행 경계 선언
- bundle 정의를 실제 자산과 정합화
- deprecation 또는 consolidation note 추가

1차 패스에서 금지:
- 스킬/에이전트 삭제
- 대규모 rename
- 스크립트 진입 동작 변경
- installer 동작 변경
- verification strictness 기본값 변경

## 계획된 순서

### Step 1. Bundle 정합화

실행:
- `code-simplifier` 같은 누락 참조 제거 또는 대체
- bundle 이름과 실제 자산 정렬

검증:
- 모든 bundle이 존재하는 자산만 참조한다

### Step 2. Entrypoint 정책 선언

실행:
- 공개 진입점이 아래 3개뿐이라는 점을 문서화
  - `product-orchestrator`
  - `moonshot-phase-runner`
  - `moonshot-orchestrator`

검증:
- large work의 기본 entrypoint가 충돌 없이 서술된다

### Step 3. 내부 표면 숨기기

실행:
- `moonshot-phase-executor` 같은 보조 요소를 internal boundary로 표시
- 분석 마이크로스킬을 orchestrator 내부 구성요소로 표시

검증:
- 사용자 문서가 Tier 1 entrypoint를 먼저 강조한다

### Step 4. 수렴 메모 준비

실행:
- 아래 후보군에 대해 consolidation note를 명시
  - analysis cluster
  - doc-ops cluster
  - UI/design helper cluster
  - verification helper cluster

검증:
- 각 후보군이 목적지와 비파괴 migration note를 가진다

## 롤백 경계

1차 패스에서 롤백이 안전한 범위:
- 문서 파일
- bundle metadata
- skill 문서 내 주석/선언

추가 검토 없이는 롤백 안전하지 않은 범위:
- runtime script
- agent routing logic
- execution-mode 기본값

## 성공 기준

1차 패스 성공 조건:
- entrypoint 정책이 모호하지 않다
- bundle drift가 제거되거나 명시적으로 주석 처리된다
- internal-only 컴포넌트가 문서화된다
- 문서 패스를 수용하기 위해 런타임 동작 변경이 필요하지 않다

## 완료된 패스

- Pass 1: entrypoint 정책과 bundle drift 정리
- Pass 2: analysis/doc-ops/verification cluster 정렬
- Pass 3: deprecated/non-default 표기와 trigger 정리
