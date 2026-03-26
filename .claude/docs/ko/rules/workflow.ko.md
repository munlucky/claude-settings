# 작업 실행 방법

- 가능하면 실제 액션(파일 읽기/편집, 검증 실행)을 선호합니다.
- **자동 태스크 분석**: Claude Code 와 Codex 모두에서 사용자 요청이 코드 작업(기능 추가/변경, 버그 수정, 리팩토링 등)인 경우 `/moonshot-orchestrator` 를 정책 경계로 사용합니다.
  - 단순 질문, 정보 조회, 읽기/설명만 하는 작업은 제외.
  - 워크플로우 상세: `.claude/skills/moonshot-orchestrator/SKILL.md`
- `moonshot-phase-runner`, `moonshot-phase-executor`, shell adapter 는 준비/라우팅만 담당하며, 실제 작업은 `moonshot-orchestrator` 또는 이를 실행하는 phase attempt 로 이어져야 합니다.
- **크로스 런타임 정책 소스**: 정책은 `skills`/오케스트레이터에 두고 `commands`/hooks/scripts는 어댑터로만 사용합니다.
- **워크플로우 프로필**: `workflowProfile`(`standard|strict`)을 사용하고 strict에서는 경고 기반 완료를 허용하지 않습니다.
- `AGENTS.md`, `.claude/CLAUDE.md`, `.claude/rules/**`, `.claude/skills/**`, `.claude/agents/**`, `.claude/templates/execution/**`, `.claude/verification.contract.yaml`, `.claude/scripts/**` 를 수정하는 `meta_harness` 작업은 `strict` 로 실행하고 fresh verification evidence 없이 완료로 처리하지 않습니다.
- phase 기반 실행에서는 `SPRINT_CONTRACT.md` 에 정책 앵커와 round별 필수 검증 명령을 유지합니다.
- **스코프 확인**: 구현/리팩토링 작업의 경우 시작 전 IN/OUT 스코프 경계를 확인. `.claude/rules/scope-confirmation.md` 참고.
- **스킬 우선순위**: 해당 작업 유형의 커스텀 스킬이나 오케스트레이터 워크플로우가 있으면 탐색적 파일 읽기 대신 즉시 사용.
- 정보가 부족하면 질문하거나 명시적으로 저위험 가정을 언급하며 진행.
- 복잡한 작업은 계획 -> 구현 -> 검증 -> 요약 순서로 진행.
