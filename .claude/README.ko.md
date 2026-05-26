# Moonshot 워크플로우 가이드

> 이 문서는 현재 저장소의 Moonshot 워크플로우 구성요소를 설명합니다. 프로젝트별 규칙은 `.claude/PROJECT.md`를 참고하세요.

## 진입점

- 전역 규칙: `.claude/CLAUDE.md` (필요 시 `@` import로 추가 규칙 로드)
- 모듈식 규칙: `.claude/rules/`
- 프로젝트 규칙: `.claude/PROJECT.md`
- 에이전트 포맷: `.claude/CLAUDE.md`
- 오케스트레이터 스킬: `.claude/skills/moonshot-orchestrator/SKILL.md`

기본 원칙:
- 일반적인 코드 작업은 `moonshot-orchestrator`를 기본 진입점으로 사용합니다.
- read-only 요청, 명시적 direct-skill 호출, self-host 워크플로우 수정은 우회가 허용됩니다.

## 메모리 구조와 우선순위

Claude Code는 아래 순서로 메모리를 로드합니다(상위가 기본 규칙, 하위가 더 구체적인 규칙).

| 메모리 유형 | 위치 | 용도 | 공유 범위 |
| --- | --- | --- | --- |
| Enterprise policy | macOS: `/Library/Application Support/ClaudeCode/CLAUDE.md`<br />Linux: `/etc/claude-code/CLAUDE.md`<br />Windows: `C:\Program Files\ClaudeCode\CLAUDE.md` | 조직 공통 규칙 | 조직 전체 |
| Project memory | `./CLAUDE.md` 또는 `./.claude/CLAUDE.md` | 프로젝트 공통 규칙 | 팀 공유 |
| Project rules | `./.claude/rules/*.md` | 모듈식 프로젝트 규칙 | 팀 공유 |
| User memory | `~/.claude/CLAUDE.md` | 개인 기본값 | 개인 |
| Project memory (local) | `./CLAUDE.local.md` | 개인 프로젝트 선호 설정 | 개인 |

- `CLAUDE.local.md`는 자동으로 `.gitignore`에 추가됩니다.

## 메모리 로딩/편집 방식

- 실행 시 cwd에서 상위 디렉토리로 올라가며 `CLAUDE.md`/`CLAUDE.local.md`를 재귀 로드합니다.
- 하위 디렉토리의 `CLAUDE.md`는 해당 경로의 파일을 읽을 때만 로드됩니다.
- `/memory`로 로딩된 메모리 확인/편집, `/init`으로 기본 `CLAUDE.md` 생성이 가능합니다.

## CLAUDE.md imports

`@path/to/import` 문법으로 추가 파일을 불러올 수 있습니다.

```
See @README for project overview and @package.json for npm commands.

# Additional Instructions
- git workflow @docs/git-instructions.md
```

- 상대/절대 경로 모두 지원합니다(예: `@~/.claude/my-project-instructions.md`).
- 코드 스팬/코드 블록 안의 `@`는 import로 처리되지 않습니다.
- import 깊이는 최대 5단계입니다.

## 모듈식 규칙 (rules/)

`.claude/rules/` 하위의 모든 `.md` 파일이 자동으로 로드됩니다(하위 디렉토리 포함).

- `~/.claude/rules/`는 사용자 규칙으로 먼저 로드됩니다.
- 필요하면 심볼릭 링크로 규칙을 공유할 수 있습니다.

- `basic-principles.md`: 기본 원칙
- `workflow.md`: 작업 실행 방식
- `context-management.md`: 컨텍스트 관리
- `quality.md`: 검증/품질
- `communication.md`: 커뮤니케이션
- `output-format.md`: 출력 형식

### Path-specific rules

- `rules/skills/skill-definition.md`: 스킬 정의 규칙 (`.claude/skills/**/*.md`)
- `rules/agents/agent-definition.md`: 에이전트 정의 규칙 (`.claude/agents/**/*.md`)
- `rules/docs/documentation.md`: 문서 규칙 (`.claude/docs/**/*.md`)
- `paths`는 표준 glob 패턴을 지원하며 여러 패턴을 지정할 수 있습니다.

## Codex Rule Propagation

Codex 런타임은 Claude Code처럼 `.claude/rules/**`가 자동 로드된다고 가정하지 않습니다.

Codex 네이티브 경로는 rule 파일을 아래 경로로 명시적으로 소비해야 합니다.
- 현재 실행 중인 skill/agent 지침
- phase 작업의 `SPRINT_CONTRACT.md` policy anchors
- skill이 읽으라고 지정한 프로젝트 문서

저장소 정책:
- Claude Code는 재귀 `.claude/rules/**` 로딩을 활용할 수 있습니다.
- Codex는 ambient memory가 아니라 explicit propagation으로 rule을 적용해야 합니다.

## 에이전트

- Requirements Analyzer: `.claude/agents/requirements-analyzer.md`
- Context Builder: `.claude/agents/context-builder.md`
- Implementation Agent: `.claude/agents/implementation-agent.md`
- Verification Agent: `.claude/agents/verification-agent.md`
- Documentation Agent: `.claude/agents/documentation-agent.md`
- Design Spec Extractor: `.claude/agents/design-spec-extractor.md`
- 검증 스크립트: `.claude/agents/verification/verify-changes.sh`

## 스킬

### Product Definition
- `product-orchestrator`
- `product-gate-reviewer`
- `task-slicer`
- `assumption-ledger`

### Moonshot 분석
- `moonshot-classify-task`
- `moonshot-evaluate-complexity`
- `moonshot-detect-uncertainty`
- `moonshot-decide-sequence`

이 스킬들은 orchestrator 내부 분석 마이크로스킬입니다.
사용자-facing workflow 진입점으로 제시하지 않습니다.

### 실행 및 검증
- `frontend-design`
- `pre-flight-check`
- `project-contract-gate`
- `context-readiness-gate`
- `verification-contract-gate`
- `design-approval-gate` (신규, strict 프로필)
- `workspace-isolation-gate` (신규, strict 프로필)
- `karpathy-execution-gate` (신규)
- `test-driven-development`
- `implementation-runner`
- `completion-verifier` (신규)
- `verification-evidence-gate` (신규, strict 프로필)
- `codex-validate-plan`
- `codex-review-code`
- `moonshot-in-session-coordinator` (고급 fallback, 기본 공개 경로 아님)
- downstream 프로젝트의 문서 기준 완료는 `REQUIREMENTS_TRACEABILITY.md`, `SCENARIO_MATRIX.md`, `UAT_CHECKLIST.md`를 종료 아티팩트로 사용합니다

### 문서 및 로깅
- `session-logger`
- `efficiency-tracker` (archived deprecated, 명시적 이력/리포팅 용도만)
- `awtl-runtime-importers.mjs`와 `awtl-import-trace.mjs`는 Codex rollout/session과 Claude transcript를 canonical AWTL event로 backfill하고 import metadata를 `payload`에 유지합니다.

### 유틸리티
- `teach-impeccable` (선택 UI/design bundle 구성요소)
- `audit`
- `normalize` (선택 UI/design bundle 구성요소)
- `polish` (선택 UI/design bundle 구성요소)
- `design-asset-parser`
- `project-md-refresh`
- `security-reviewer`
- `build-error-resolver`

### 공개 표면 정책

공개 표면 상태의 source of truth는 `.claude/docs/guidelines/skill-composition.ko.md`입니다.

| 상태 | 의미 |
| --- | --- |
| `public_entrypoint` | 사용자가 workflow 시작점으로 직접 선택할 수 있음 |
| `public_utility` | 좁은 유틸리티 목적에 한해 직접 호출할 수 있음 |
| `internal_stage_owner` | stage 또는 orchestrator 소유이며 workflow 진입점으로 광고하지 않음 |
| `optional_bundle_member` | task profile이 해당 bundle을 필요로 할 때만 로드 |
| `deprecated` | 호환성/이력 용도로만 유지하며 기본 흐름에는 포함하지 않음 |

## executionPlane

오케스트레이터는 요청을 먼저 아래 세 가지 plane 중 하나로 분류합니다.

- `read_only`: 설명, 요약, 조사, review-only
- `product_project`: downstream 프로젝트 구현/검증
- `meta_harness`: `.claude/skills`, `.claude/rules`, `.claude/agents`, 설치/배포 로직 같은 self-host 작업

`product_project`에서는 구현 전에 readiness gate를 통과해야 합니다.

downstream 프로젝트가 `.claude`, `.agents`, `.codex`를 ignore하는 경우 `bash .claude/scripts/harness-prepare-worktree.sh <task-id> --hydrate-agent-config --baseline-command "<cmd>"`로 worktree를 만들고 agent harness를 hydrate한 뒤 `.claude/worktree-prepare.json` evidence를 남깁니다.

## 일반 흐름 (예시)

1. 아이디어 단계면 `product-orchestrator`가 `PRODUCT_INTENT -> PRD -> SOLUTION -> SPEC -> PLAN`으로 변환합니다.
2. `product-gate-reviewer`와 `task-slicer`가 게이트 판정과 `tasks/*.md` 분해를 수행합니다.
3. medium/complex 구현은 코드 작성 전에 slice별 `SPRINT_CONTRACT.md`를 만들어 이번 라운드의 done check와 non-goal을 먼저 고정합니다.
4. `moonshot-orchestrator`가 요청을 분석하고 `executionPlane`을 분류합니다.
5. `product_project`이면 `pre-flight-check`와 readiness gate(`project-contract-gate`, `context-readiness-gate`, `verification-contract-gate`)가 최소 계약을 확인합니다.
6. product package가 있으면 이를 planning source of truth로 사용하고, 없으면 `requirements-analyzer`와 `context-builder`가 계획을 정리합니다.
7. 복잡한 작업은 `codex-validate-plan`으로 계획을 검증하고, `karpathy-execution-gate`를 거친 뒤 `implementation-runner`를 실행합니다.
8. 동작 변경 작업은 production code 변경 전에 `test-driven-development`로 red/green/refactor evidence를 남깁니다.
9. React/웹 UI 구현에서는 `frontend-design`을 UI bundle의 umbrella로 주입하고, `teach-impeccable`는 디자인 컨텍스트 bootstrap이 필요한 경우에만 선택적으로 실행합니다.
10. `completion-verifier`, `browser-verifier`, `verify-changes.sh`, `verify-runtime.sh` 같은 별도 evaluator 경로로 검증하고 결과를 `QA_REPORT.md`에 남깁니다.
11. 세션이 길어지거나 중단되면 `HANDOFF.md`로 재개 상태를 남깁니다.
12. `documentation-agent`가 문서화를 마무리하고 필요 시 `doc-sync`를 호출합니다.

통합 phase 실행 경계:
- 사용자 진입점은 `/moonshot-phase-runner <plan-dir>`입니다.
- skill-level 실행 어댑터는 `moonshot-phase-executor`입니다.
- 내부 command adapter는 `node .claude/scripts/moonshot-phase-dispatch.mjs`를 우선 사용합니다.
- `.claude/scripts/moonshot-phase-dispatch.sh`는 compatibility wrapper로 유지됩니다.
- runtime 선택은 `auto|claude|codex`를 유지합니다.

phase runner 기본 동작:
- `/moonshot-phase-runner`를 인자 없이 호출하면 먼저 안전한 기존 plan dir를 재사용하려고 시도합니다.
- 안전한 plan dir가 없으면 `moonshot-plan-writer`로 `docs/implementation`을 bootstrap합니다.
- `/moonshot-phase-runner <plan-dir>`는 이제 artifact 준비 후 `moonshot-phase-executor`를 즉시 실행합니다.
- 준비만 하고 멈추고 싶을 때만 `--prepare-only`를 사용합니다.
- `delegated-terminal`에서는 executor가 dispatch/agent-loop 경로에 계속 붙어 있어야 하며, partial 1회 요약으로 대체하면 안 됩니다.
- 기본 auto-start 실행에서는 phase 경계가 반환 경계가 아니며, active plan directory에 남은 actionable phase가 없어질 때까지 계속 진행해야 합니다.

## 문서와 템플릿

- 작업 문서는 `.claude/docs` 하위에 두며 경로 규칙은 `.claude/PROJECT.md`를 따릅니다.
- 출력 템플릿: `.claude/templates/moonshot-output.md`, `.claude/templates/moonshot-output.ko.md`, `.claude/templates/moonshot-output.yaml`.
- 제품 정의 가이드: `.claude/docs/guidelines/product-definition-workflow.md`
- 장시간 하네스 가이드: `.claude/docs/guidelines/long-running-harness.ko.md`
- 문서 추적 완료 하네스 가이드: `.claude/docs/guidelines/requirements-traceability-harness.ko.md`
- 외부 하네스 도입 준비 패키지: `docs/claude-tasks/external-harness-adoption/`
- 제품 정의 템플릿: `.claude/templates/product-definition/`
- 실행 아티팩트 템플릿: `.claude/templates/execution/`
- downstream bootstrap reference package: `.claude/docs/reference-downstream/README.md`

## 유지보수 노트 (이 저장소)

- 영문 `.md`는 ASCII만 사용하고 동일한 `.ko.md`를 함께 유지합니다.
- 이름이나 경로를 바꾸면 이 문서와 `install-claude.sh`를 함께 갱신합니다.
- 대상 프로젝트의 부트스트랩 문서 세트가 비어 있으면 `project-md-refresh` 스킬을 실행합니다.
- `project-md-refresh`는 `.claude/PROJECT.md`와 함께 `workflow/README.md`, `docs/design/README.md`, `docs/glossary/README.md`, `docs/daily/README.md`, `TEST_GUIDE.md`, `docs/analysis/README.md`를 갱신해야 합니다.
- 대상 프로젝트 검증은 `.claude/verification.contract.yaml` 같은 계약 문서로 선언하는 방식을 우선합니다.
