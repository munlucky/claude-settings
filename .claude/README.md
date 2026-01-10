# Moonshot 워크플로우 가이드

> 이 문서는 현재 저장소의 Moonshot 워크플로우 구성요소를 설명합니다. 프로젝트별 규칙은 `.claude/PROJECT.md`를 참고하세요.

## 진입점

- 전역 규칙: `.claude/CLAUDE.md`
- 프로젝트 규칙: `.claude/PROJECT.md`
- 에이전트 포맷: `.claude/AGENT.md`
- 오케스트레이터 스킬: `.claude/skills/moonshot-orchestrator/SKILL.md`

## 에이전트

- Requirements Analyzer: `.claude/agents/requirements-analyzer.md`
- Context Builder: `.claude/agents/context-builder.md`
- Implementation Agent: `.claude/agents/implementation-agent.md`
- Verification Agent: `.claude/agents/verification-agent.md`
- Documentation Agent: `.claude/agents/documentation-agent.md`
- Design Spec Extractor: `.claude/agents/design-spec-extractor.md`
- 검증 스크립트: `.claude/agents/verification/verify-changes.sh`

## 스킬

### Moonshot 분석
- `moonshot-classify-task`
- `moonshot-evaluate-complexity`
- `moonshot-detect-uncertainty`
- `moonshot-decide-sequence`

### 실행 및 검증
- `pre-flight-check`
- `implementation-runner`
- `codex-validate-plan`
- `codex-test-integration`
- `claude-codex-guardrail-loop`
- `receiving-code-review`

### 문서 및 로깅
- `doc-sync`
- `session-logger`
- `efficiency-tracker`

### 유틸리티
- `design-asset-parser`
- `project-md-refresh`

## 일반 흐름 (예시)

1. `moonshot-orchestrator`가 요청을 분석하고 체인을 구성합니다.
2. `requirements-analyzer`와 `context-builder`가 계획을 정리합니다.
3. 복잡한 작업은 `codex-validate-plan`과 `implementation-runner`를 병렬로 실행합니다.
4. `verification-agent`와 `verify-changes.sh`로 품질을 확인합니다.
5. `documentation-agent`가 문서화를 마무리하고 필요 시 `doc-sync`를 호출합니다.

## 문서와 템플릿

- 작업 문서는 `.claude/docs` 하위에 두며 경로 규칙은 `.claude/PROJECT.md`를 따릅니다.
- 출력 템플릿: `.claude/templates/moonshot-output.md`, `.claude/templates/moonshot-output.ko.md`, `.claude/templates/moonshot-output.yaml`.

## 유지보수 노트 (이 저장소)

- 영문 `.md`는 ASCII만 사용하고 동일한 `.ko.md`를 함께 유지합니다.
- 이름이나 경로를 바꾸면 이 문서와 `install-claude.sh`를 함께 갱신합니다.
- 대상 프로젝트에 `PROJECT.md`가 없다면 `project-md-refresh` 스킬을 실행합니다.
