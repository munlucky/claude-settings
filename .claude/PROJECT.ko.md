# PROJECT.md

> Claude Settings 메타 하네스 저장소의 운영 계약서입니다. downstream 템플릿 안내는 유지하되, 이 저장소 안에서는 비어 있는 템플릿으로 취급하지 않습니다.

Last-Reviewed: 2026-03-30

## 프로젝트 개요

- **서비스**: 재사용 가능한 rules, skills, agents, scripts, templates, workflow 문서를 보관하는 Claude Settings 메타 하네스 저장소
- **스택**: Markdown + YAML + Bash + Python 3 + `.claude/tools/browserd` 아래의 Node.js 보조 툴링
- **응답 언어**: 사용자 요청 언어를 따르며, 이 저장소 협업에서는 한국어를 기본값으로 둠

### 기술 스택 상세

- **런타임**: Bash, Python 3, Node.js, Git
- **주요 자산**: `.md`, `.yaml`, `.sh`, `.py`, `.cjs`, `.mjs`
- **빌드 모델**: 컴파일 애플리케이션 빌드 없음, 스크립트와 문서 중심 검증
- **핵심 도구**:
  - `.claude/scripts/` 의 셸 검증 스크립트
  - `.claude/agents/verification/` 의 verifier 스크립트
  - `.claude/tools/browserd/` 의 브라우저 보조 툴링

## 핵심 규칙

1. **계획 경계**: human approval 은 planning closeout 에서만 사용할 수 있습니다. execution 시작 후에는 true blocker 나 외부 의존성이 없는 한 implementation, review, verification, retry loop 를 자율적으로 유지합니다.
2. **소스 오브 트루스**: 지속 정책은 `AGENTS.md` 나 `.claude/CLAUDE.md`가 아니라 `.claude/rules/`, `.claude/docs/guidelines/`, 이 문서에 둡니다.
3. **문서 페어링**: 한국어 짝 문서가 있는 영문 `.md`를 바꾸면 대응 `.ko.md`도 함께 유지합니다.
4. **보안 경계**: `.claudeignore`, protected path, deny-by-default 도구/경로 접근 원칙을 지킵니다.
5. **검증 규율**: 의미 있는 변경은 “checkpoint reached”로 닫지 말고 필수 검증 명령과 evidence artifact를 사용합니다.
6. **스코프 규율**: 계획 가치가 약하거나 불명확하면 추측성 확장보다 scope reduction 을 우선합니다.

## 테스트 규칙

- **테스트 프레임워크**: 저장소 로컬 스크립트 검증, shell syntax check, knowledge audit, workflow enforcement, verifier contract
- **테스트 파일 위치**:
  - `.claude/scripts/*.sh`
  - `.claude/agents/verification/*.sh`
  - `.claude/docs/guidelines/` 의 관련 계약 문서
- **커버리지 기대치**:
  - doc-only 변경: audit 와 링크/신선도 무결성
  - local policy 변경: audit + 관련 syntax/policy check
  - behavior-changing harness logic: 환경이 허용되면 deterministic verifier evidence
- **실행 명령**:
  - Knowledge audit: `bash .claude/scripts/knowledge-repo-audit.sh`
  - Code policy: `bash .claude/scripts/verify-code-policy.sh`
  - Workflow enforcement: `bash .claude/scripts/workflow-enforcement.sh verify`
  - Shell syntax: `bash -n .claude/scripts/knowledge-repo-audit.sh && bash -n .claude/scripts/verify-code-policy.sh && bash -n .claude/scripts/workflow-enforcement.sh && bash -n .claude/scripts/agent-loop.sh && bash -n .claude/scripts/moonshot-phase-dispatch.sh && bash -n .claude/scripts/verify-phase-runtime-parity.sh && bash -n .claude/agents/verification/verify-changes.sh && bash -n .claude/agents/verification/verify-runtime.sh`
  - Runtime parity: `bash .claude/scripts/verify-phase-runtime-parity.sh docs/implementation`

### 테스트 작성 규칙

- behavior-changing logic 는 가능하면 deterministic verification 을 추가하거나 강화해야 합니다.
- 버그 수정에는 regression test 또는 동등한 verifier evidence 가 필요합니다.
- 기존 체크/테스트를 삭제할 때는 명시적 이유와 대체 경로가 있어야 합니다.

## Git 워크플로우

### 브랜치 명명 규칙

```text
codex/{task}            # Codex 기본 작업 브랜치
feature/{feature-name}  # 새 워크플로우 기능
fix/{issue-number}      # 버그 수정
chore/{task}            # 문서, 정책, 유지보수
```

### 커밋 메시지 형식

```text
[type]: concise description

예시:
feat: add planning value rubric
fix: tighten workflow enforcement wording
chore: refresh harness project contract
```

**규칙:**
- 이모지, 특수문자 사용 금지
- 커밋 메시지 언어는 한 가지로 통일
- 가능하면 50자 내외의 간결한 메시지를 우선

### PR 요구사항

- CI 또는 필수 로컬 체크 통과
- 공용 skill/rule 로직 변경은 리뷰 필요
- task package 또는 implementation 문서가 있으면 연결

## 디렉터리/구조

```text
[project root]/
|-- .claude/
|   |-- rules/
|   |-- skills/
|   |-- agents/
|   |-- docs/guidelines/
|   |-- scripts/
|   |-- templates/
|   `-- verification.contract.yaml
|-- docs/
|   |-- implementation/
|   `-- reference-downstream/
`-- AGENTS.md
```

### 주요 패턴

```text
.claude/rules/*.md                 # 항상 로드되거나 path-scoped 된 정책
.claude/skills/*/SKILL*.md         # 스킬 계약
.claude/agents/**/*.md             # 에이전트 계약
.claude/scripts/*.sh               # 기계 검증과 오케스트레이션 보조 스크립트
docs/implementation/*.md           # 계획/실행 검토 문서
docs/reference-downstream/**       # copy 가능한 downstream bootstrap reference
```

## API/데이터 통신 패턴

- **API 엔드포인트**: 없음. 이 저장소는 애플리케이션 서비스가 아닙니다.
- **헬퍼 함수**: `.claude/scripts/` 와 `.claude/agents/verification/` 의 shell/Python helper
- **계약 교환 방식**: `PROJECT.md`, `context.md`, `SPRINT_CONTRACT.md`, verdict JSON, scorecard 같은 Markdown/YAML/JSON artifact 중심

## 타입/도메인 패턴

- **타입 정의 위치**: 중앙 TS 도메인 모델 없음, 구조화 계약은 Markdown/YAML/JSON 에 둠
- **도메인 모델**:
  - execution plane: `read_only`, `product_project`, `meta_harness`
  - workflow profile: `standard`, `strict`
  - execution artifact: `SPRINT_CONTRACT.md`, `QA_REPORT.md`, `HANDOFF.md`, `SCORECARD.md`

## 권한/인증

- **인증 방식**: 저장소 내부 자체 인증 없음
- **권한 체계**: 활성 런타임, 로컬 파일시스템 권한, tool approval 정책을 따름
- **민감 경로 정책**: `.claudeignore`, `.gitignore`, security 규칙으로 protected path 를 기본 컨텍스트에서 제외

## 문서 경로

```yaml
documentPaths:
  tasksRoot: ".claude/docs/tasks"
  agreementsRoot: ".claude/docs/agreements"
  guidelinesRoot: ".claude/docs/guidelines"
```

### 경로 템플릿

| 문서 | 경로 패턴 |
|------|----------|
| 사전 합의서 | `{agreementsRoot}/{feature-name}-agreement.md` |
| 제품 의도서 | `{tasksRoot}/{feature-name}/product/PRODUCT_INTENT.md` |
| 제품 요구사항 | `{tasksRoot}/{feature-name}/product/PRD.md` |
| 제품 동작 모델 | `{tasksRoot}/{feature-name}/product/SOLUTION.md` |
| 아키텍처 명세 | `{tasksRoot}/{feature-name}/product/SPEC.md` |
| 아키텍처 결정 기록 | `{tasksRoot}/{feature-name}/product/ADR/*.md` |
| 실행 계획 | `{tasksRoot}/{feature-name}/product/PLAN.md` |
| 실행 task | `{tasksRoot}/{feature-name}/product/tasks/*.md` |
| 가정 원장 | `{tasksRoot}/{feature-name}/product/ASSUMPTIONS.md` |
| 하드 blocker | `{tasksRoot}/{feature-name}/product/BLOCKERS.md` |
| 구현 계획 | `{tasksRoot}/{feature-name}/context.md` |
| 명세서 | `{tasksRoot}/{feature-name}/specification.md` |
| 아카이브 | `{tasksRoot}/{feature-name}/archives/` |
| 세션 로그 | `{tasksRoot}/{feature-name}/session-logs/day-{YYYY-MM-DD}.md` |
| 미해결 질문 | `{tasksRoot}/{feature-name}/pending-questions.md` |
| 추적/UAT 아티팩트 | `{tasksRoot}/{feature-name}/execution/{REQUIREMENTS_TRACEABILITY,SCENARIO_MATRIX,UAT_CHECKLIST}.md` |

### Downstream 기준 문서

설치 대상 downstream 프로젝트에는 아래 문서를 부트스트랩하고 유지합니다.

- `workflow/README.md`
- `docs/design/README.md`
- `docs/glossary/README.md`
- `docs/daily/README.md`
- `TEST_GUIDE.md`
- `docs/analysis/README.md`

구체적인 예시는 `docs/reference-downstream/README.md`를 참고합니다.

## 지식 저장소 (Agent-First)

- 루트 `AGENTS.md`는 짧은 맵으로 유지합니다.
- 지속 정책은 아래 소스 오브 트루스 경로에 저장합니다.
  - `PROJECT.md`
  - `docs/guidelines/` 또는 `.claude/docs/guidelines/`
  - `.claude/rules/`
- 핵심 맵/계약 문서에는 `Last-Reviewed: YYYY-MM-DD`를 기록합니다.
- 구조 변경 후 `.claude/scripts/knowledge-repo-audit.sh`를 실행합니다.

## 검증/명령

- `bash .claude/scripts/knowledge-repo-audit.sh`
- `bash .claude/scripts/verify-code-policy.sh`
- `bash .claude/scripts/workflow-enforcement.sh verify`
- `bash .claude/scripts/verify-phase-runtime-parity.sh docs/implementation`
- `bash -n .claude/scripts/knowledge-repo-audit.sh && bash -n .claude/scripts/verify-code-policy.sh && bash -n .claude/scripts/workflow-enforcement.sh && bash -n .claude/scripts/agent-loop.sh && bash -n .claude/scripts/moonshot-phase-dispatch.sh && bash -n .claude/scripts/verify-phase-runtime-parity.sh && bash -n .claude/agents/verification/verify-changes.sh && bash -n .claude/agents/verification/verify-runtime.sh`

## 환경 변수

```text
KNOWLEDGE_REVIEW_MAX_DAYS="knowledge audit 의 review freshness window override"
KNOWLEDGE_REQUIRE_PROJECT_FILLED="audit 시 PROJECT 문서 채움 강제"
KNOWLEDGE_ALWAYS_LOADED_RULE_LINE_MAX="rules 라인 예산 override"
KNOWLEDGE_ALWAYS_LOADED_TOTAL_LINE_MAX="always-loaded 총 라인 예산 override"
KNOWLEDGE_ALWAYS_LOADED_TOKEN_MAX="always-loaded 토큰 예산 override"
HARNESS_KNOWLEDGE_AUDIT_FILE="knowledge-audit JSON 출력 경로"
VERIFY_CODE_POLICY_MAX_FILE_LINES="code-policy 파일 길이 제한"
VERIFY_CODE_POLICY_BASELINE_FILE="code-policy 예외 baseline 파일"
PHASE_RUNTIME_PARITY_KEEP_TMP="runtime parity 디버깅용 임시 워크스페이스 유지"
```
