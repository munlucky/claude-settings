# 스킬 아키텍처 재정비 변경 패키지

Last-Reviewed: 2026-04-24

## 상태

하네스 다이어트 문서와 targeted skill metadata pass가 완료됐다.
script, installer, runtime dispatch rewrite는 필요하지 않았다.

## 첫 구현 패스

목표:
- 주요 실행 의미를 바꾸지 않고 아키텍처를 읽히게 만든다

대상 파일:
- `.claude/docs/guidelines/skill-composition.md`
- `docs/claude-tasks/skill-architecture-rework/*`
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
- 2026-04-24 pass: surface-status taxonomy 추가, targeted skill을 `internal_stage_owner` / `optional_bundle_member` / `deprecated`로 표시, production skill 대량 설치 없이 외부 workflow 패턴을 로컬 stage model에 흡수

## Migration Notes

| Cluster | 결정 | 목적지 |
|---|---|---|
| 분석 마이크로스킬 | 유지, 내부화 | 공개 orchestrator 뒤의 `analysis-bundle` |
| Phase executor/coordinator | 유지, 내부화 | `moonshot-phase-runner` 실행 경계, 가능하면 delegated-terminal 기본 |
| UI/design helper | 선택 bundle 구성요소로 유지 | `frontend-design` umbrella와 명시적 UI review 시 `review-bundle` |
| Browser/guided QA helper | 선택 bundle 구성요소로 유지 | runtime/browser evidence가 필요할 때만 `verification-bundle` |
| Doc-ops helper | 선택 bundle 구성요소로 유지 | `finish-bundle` 또는 `doc-ops-bundle`, `session-logger`는 public utility 유지 |
| Deprecated workflow reflection | 유지하되 기본 제외 | `efficiency-tracker`, `workflow-self-improver`는 명시적 이력/유지보수 검토용 |

## Validation Additions

이번 pass의 수동 정합성 체크:
- deprecated skill은 문서에서 deprecated 또는 non-default 자산으로만 언급한다
- primary public entrypoint는 `product-orchestrator`, `moonshot-phase-runner`, `moonshot-orchestrator`로 제한한다
- bundle membership이 새 public entrypoint처럼 보이면 안 된다
- `.claude/scripts/**`와 installer behavior는 변경하지 않는다
