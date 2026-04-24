# skills.sh 워크플로우 정렬 변경 패키지

Last-Reviewed: 2026-04-24

## 상태

Wave 1 문서와 metadata pass가 완료됐다.

이 패키지는 runtime behavior를 바꾸지 않는다.
production skill 대량 설치 없이 선택한 `skills.sh` 운영 패턴을 로컬 stage model에 적용한다.

## Wave 1 목표

기본 execution plane은 유지하면서, 워크플로우를 더 쉽게 찾고 따를 수 있게 만든다.

## Wave 1 변경 유형

### 1. Stage 모델 승격

목표 상태:
- intake, plan, ready/isolate, execute, review, verify, finish를 한눈에 보여주는 workflow map 확보

업그레이드 모드:
- `promote-stage`

### 2. Entrypoint 가이드 강화

목표 상태:
- 공개 1차 entrypoint 3개는 계속 명확하게 유지
- internal helper는 internal로 남김

업그레이드 모드:
- `re-describe`

### 3. Review / Finish 재번들링

목표 상태:
- review가 반복되는 명시적 stage가 됨
- finish/handoff가 흩어진 utility가 아니라 기본 closeout stage가 됨

업그레이드 모드:
- `re-bundle`

### 4. Skill metadata 정리

목표 상태:
- 대상 스킬의 description이 trigger-oriented하게 바뀜
- description이 내부 workflow를 요약해서 본문 읽기를 방해하지 않음

업그레이드 모드:
- `tighten-trigger`

## Wave 1 대상 파일

주요 문서/규칙:

- `.claude/README.md`
- `.claude/rules/workflow.md`
- `.claude/docs/guidelines/skill-composition.md`
- `.claude/docs/guidelines/skill-composition.ko.md`

우선 수정 후보 skill docs:

- `.claude/skills/product-orchestrator/SKILL.md`
- `.claude/skills/product-orchestrator/SKILL.ko.md`
- `.claude/skills/moonshot-phase-runner/SKILL.md`
- `.claude/skills/moonshot-phase-runner/SKILL.ko.md`
- `.claude/skills/moonshot-orchestrator/SKILL.md`
- `.claude/skills/moonshot-orchestrator/SKILL.ko.md`
- `.claude/skills/moonshot-plan-writer/SKILL.md`
- `.claude/skills/moonshot-plan-writer/SKILL.ko.md`
- `.claude/skills/workspace-isolation-gate/SKILL.md`
- `.claude/skills/workspace-isolation-gate/SKILL.ko.md`
- `.claude/skills/codex-review-code/SKILL.md`
- `.claude/skills/codex-review-code/SKILL.ko.md`
- `.claude/skills/completion-verifier/SKILL.md`
- `.claude/skills/completion-verifier/SKILL.ko.md`
- `.claude/skills/verification-evidence-gate/SKILL.md`
- `.claude/skills/verification-evidence-gate/SKILL.ko.md`
- `.claude/skills/session-logger/SKILL.md`
- `.claude/skills/session-logger/SKILL.ko.md`
- `.claude/skills/commit-moonshot/SKILL.md`
- `.claude/skills/commit-moonshot/SKILL.ko.md`

## Wave 1 비대상

- `.claude/scripts/**`
- runtime dispatch shell adapter
- installation script
- 대량 파일 rename
- 기존 skill/agent 삭제

## 성공 기준

Wave 1은 아래 조건이 충족되면 성공이다.

1. 하나의 stage map으로 전체 workflow를 이해할 수 있다.
2. medium/complex 작업에서 review와 finish가 어디서 일어나는지 명확하다.
3. isolation이 숨겨진 규칙이 아니라 정상적인 준비 단계로 설명된다.
4. 대상 스킬의 description이 더 trigger-oriented하고 discoverable해진다.
5. verification/evidence 요구사항은 계속 명시적이고 선택 불가다.
6. 문서 패스를 수용하기 위해 runtime behavior 변경이 필요하지 않다.

## 2026-04-24 결과

- Stage model은 `.claude/README.md`, `.claude/README.ko.md`, `skill-composition` 문서에 보인다.
- 공개 진입점은 primary workflow skill 3개와 public utility 2개로 유지된다.
- Ready / Isolate, Review, Verify, Finish / Handoff는 흡수한 외부 운영 패턴을 명시한다.
- targeted skill은 internal, optional, deprecated 표면에 대해 `surfaceStatus` metadata를 가진다.
- 기본 flow에서 `skills.sh` 대량 설치는 reject하고, pilot/sandbox 검토는 허용한다.
- 외부 평가 프레임워크는 runtime dependency가 아니라 regression-plane 후보로 보류한다.

## Wave 2 결과

- TDD-first 실행은 로컬 `test-driven-development` skill과 실행 template에 반영됐다.
- Systematic debugging은 root-cause-first failure reporting과 recovery rule로 반영됐다.
- Ready / Isolate는 strict 또는 phase 작업에서 구체적인 workspace prepare/baseline evidence를 요구한다.
- Plan과 task slice는 exact files, commands, fail/pass signals, blockers, review checkpoints, evidence paths를 요구한다.
- Scorecard는 외부 scoring runtime 없이 task-level `FULL / PARTIAL / NO` 상태 어휘를 노출한다.
- 외부 도입 pilot package는 `docs/claude-tasks/external-harness-adoption/`에 둔다.

## Pilot Policy

나중에 외부 skill 또는 harness를 테스트한다면:
- production `.claude/skills` 밖에서 실행한다
- 결과를 `adopt`, `adapt`, `reject`, `defer` 중 하나로 기록한다
- skill이 안전하고 중복이 없다는 점이 검증되기 전에는 전략/checklist만 로컬로 이식한다
- `skill-composition`과 skill architecture inventory를 갱신하지 않고 새 public entrypoint를 추가하지 않는다

## Wave 1 이후 가능성

Wave 1 결과가 필요성을 보여줄 때만 고려할 Wave 2 후보:

- pilot evidence가 쌓인 뒤 worktree prepare를 자동 script로 만들지 판단
- 현재 bundle guidance가 느슨하면 work size별 review cadence 강화
- 로컬 task corpus가 쌓인 뒤 외부 benchmark pilot 실행

## 롤백 경계

Wave 1은 아래 범위에 머물면 rollback-safe하다.

- 문서 파일
- 규칙 문구
- skill description
- stage visibility note

아래로 확장되면 rollback-safe 범위를 벗어난다.

- runtime dispatch 변경
- 자동 worktree/bootstrap 동작
- script 기반 orchestration 변경
