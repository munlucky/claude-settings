# skills.sh 워크플로우 정렬 준비 명세

Last-Reviewed: 2026-03-27

## 목적

`skills.sh` 벤치마크를 반영해 워크플로우 문서, 규칙, bundle, skill metadata를 바꾸기 전에 필요한 준비 단계를 정확히 정의한다.

이 문서는 change gate 직전에서 멈춘다.

## 목표 단계 모델

준비 작업은 향후 워크플로우가 아래 7단계로 표현되어야 한다는 가정 위에서 진행한다.

1. Intake
2. Plan
3. Ready / Isolate
4. Execute
5. Review
6. Verify
7. Finish / Handoff

## 제안하는 로컬 단계 소유자

| 단계 | 주요 로컬 owner | 메모 |
|---|---|---|
| Intake | `product-orchestrator`, `moonshot-phase-runner`, `moonshot-orchestrator` | 현재 3-entrypoint 정책 유지 |
| Plan | `requirements-analyzer`, `context-builder`, `moonshot-plan-writer`, `task-slicer`, `codex-validate-plan` | 계획 작성, 분해, 리뷰 포함 |
| Ready / Isolate | `pre-flight-check`, `project-contract-gate`, `context-readiness-gate`, `verification-contract-gate`, `workspace-isolation-gate` | 정상적인 stage로 더 잘 드러나야 함 |
| Execute | `karpathy-execution-gate`, `implementation-runner`, `build-error-resolver`, `moonshot-phase-executor`, `moonshot-in-session-coordinator`, `moonshot-teams-runner` | capability보다는 surfacing과 경계 정리가 중요 |
| Review | `codex-review-code`, `security-reviewer`, `audit`, `web-design-guidelines` | cadence와 적용 범위를 더 분명히 해야 함 |
| Verify | `browser-verifier`, `qa-flow`, `completion-verifier`, `verification-evidence-gate` | 이미 강한 로컬 stage이며 strict하게 유지 |
| Finish / Handoff | `doc-auto-sync`, `session-logger`, `commit-moonshot` | 더 명시적인 decision flow와 closeout 계약 필요 |

## 단계별 준비 페이즈

### Phase 0. 벤치마크 고정

목표:
- `skills.sh` 검토 결과를 로컬 저장소가 채택/변형/기각할 수 있는 명시적 패턴으로 줄인다

작업:
- 운영 가치가 분명한 패턴만 남긴다
- stage-model 교훈과 일반적인 스타일 조언을 분리한다
- 외부 패턴이 현재 로컬 제약과 충돌하는 지점을 기록한다

산출물:
- `benchmark.md`

종료 기준:
- 어느 벤치마크 항목도 막연한 inspiration 상태로 남지 않는다

### Phase 1. Stage Map 작성

목표:
- 로컬 저장소를 위한 단일 authoritative workflow view를 만든다

작업:
- 중요한 현재 workflow 자산을 하나의 주 단계에 배치한다
- user-facing entrypoint와 internal stage owner를 구분한다
- medium/complex 작업에서 필수인 단계를 선언한다

산출물:
- `specification.md`의 stage-owner 표

종료 기준:
- 모든 목표 단계에 owner가 선언되어 있다

### Phase 2. 자산별 업그레이드 방식 결정

목표:
- 구현 범위를 과도하게 넓히지 않고 현재 자산을 어떻게 바꿀지 정한다

허용 모드:
- `keep`
- `re-describe`
- `re-bundle`
- `tighten-trigger`
- `promote-stage`
- `defer`

작업:
- capability는 충분하지만 discoverability가 약하면 `re-describe`
- stage ownership은 있으나 흩어져 있으면 `re-bundle`
- 숨겨진 guardrail을 눈에 보이는 workflow step으로 올려야 하면 `promote-stage`
- runtime behavior 수정이 필요한 변경은 `defer`

산출물:
- `change-package.md`의 단계별 업그레이드 노트

종료 기준:
- 모든 목표 영역에 업그레이드 모드가 하나씩 선언되어 있다

### Phase 3. Wave 1 파일 범위 준비

목표:
- 1차 구현을 안전한 문서/메타데이터 변경으로 제한한다

작업:
- 먼저 수정할 문서와 규칙 파일을 정리한다
- description 또는 visibility note를 수정해야 할 최소 skill docs를 정리한다
- shell script와 runtime dispatch는 Wave 1에서 제외한다

산출물:
- `change-package.md`의 Wave 1 파일 목록

종료 기준:
- runtime adapter를 건드리지 않고도 1차 패스를 실행할 수 있다

### Phase 4. 향후 구현 검증 기준 정의

목표:
- 실제 구현 패스가 무엇으로 평가될지 선언한다

작업:
- 공개 문서에 하나의 visible stage map이 있어야 한다
- review와 finish stage 가이드가 명시적으로 보여야 한다
- 대상 스킬의 description은 trigger-oriented해야 한다
- verification discipline은 계속 명시적이어야 한다

산출물:
- `change-package.md`의 success criteria

종료 기준:
- 구현 결과를 객관적인 workflow outcome으로 리뷰할 수 있다

## 규칙

- 준비 단계에서는 새로운 default public entrypoint를 추가하지 않는다
- evidence-before-completion 규칙을 느슨하게 만들지 않는다
- Wave 1에서 runtime dispatch를 바꾸지 않는다
- 첫 workflow 패스에 unrelated architecture cleanup을 끼워 넣지 않는다

## 첫 구현 경계

Wave 1은 보통 아래를 수정하는 선에서 시작해야 한다.

- `.claude/README.md`
- `.claude/rules/workflow.md`
- `.claude/docs/guidelines/skill-composition.md`
- stage visibility와 trigger quality를 정리할 대상 `SKILL.md`, `SKILL.ko.md`

Wave 1 시작점으로 부적절한 것:

- script 재작성
- branch automation 변경
- 대량 skill rename
- 기존 workflow asset 삭제
