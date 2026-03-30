# skills.sh 워크플로우 정렬 변경 패키지

Last-Reviewed: 2026-03-27

## 상태

준비 단계 전용이다.

이 패키지는 runtime behavior를 바꾸지 않는다.
`skills.sh`를 참고한 stage-based workflow 정리를 준비한다.

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

## Wave 1 이후 가능성

Wave 1 결과가 필요성을 보여줄 때만 고려할 Wave 2 후보:

- 기존 문서가 과밀해지면 dedicated workflow-stage guideline 추가
- work size별 local review cadence 계약 정의
- 구조화된 finish/handoff decision flow 정의
- 일부 internal helper를 raw micro-skill 대신 wrapper로 둘지 재검토

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
