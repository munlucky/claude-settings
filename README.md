# Claude Settings

> Claude Code를 위한 프로젝트 설정과 Moonshot 워크플로우 템플릿 모음

## 개요

이 저장소는 Claude Code에서 사용할 규칙, 에이전트, 스킬, 문서 템플릿을 한곳에서 관리합니다. 다양한 프로젝트에 재사용 가능한 워크플로우를 제공하고, 설치 스크립트로 손쉽게 배포할 수 있습니다.

## 구성 요약

- `.claude/`에 규칙, 에이전트, 스킬, 문서, 템플릿을 집중 관리
- 대부분의 문서는 `.md`(영문)와 `.ko.md`(한글) 쌍으로 제공
- `install-claude.sh`로 다른 프로젝트에 빠르게 설치

## 디렉터리 구조

```
claude-settings/
├── install-claude.sh
├── README.md
├── .claude/
│   ├── CLAUDE.md / CLAUDE.ko.md
│   ├── PROJECT.md / PROJECT.ko.md
│   ├── AGENT.md / AGENT.ko.md
│   ├── README.md / README.ko.md
│   ├── settings.local.json
│   ├── agents/
│   │   ├── requirements-analyzer.md
│   │   ├── context-builder.md
│   │   ├── implementation-agent.md
│   │   ├── verification-agent.md
│   │   ├── documentation-agent.md
│   │   └── design-spec-extractor.md
│   ├── skills/
│   │   ├── moonshot-orchestrator/
│   │   ├── moonshot-classify-task/
│   │   ├── moonshot-evaluate-complexity/
│   │   ├── moonshot-detect-uncertainty/
│   │   ├── moonshot-decide-sequence/
│   │   ├── pre-flight-check/
│   │   ├── implementation-runner/
│   │   ├── codex-validate-plan/
│   │   ├── codex-test-integration/
│   │   ├── claude-codex-guardrail-loop/
│   │   ├── doc-sync/
│   │   ├── efficiency-tracker/
│   │   ├── session-logger/
│   │   ├── design-asset-parser/
│   │   ├── receiving-code-review/
│   │   └── project-md-refresh/
│   ├── docs/
│   │   ├── guidelines/
│   │   │   ├── analysis-guide.md
│   │   │   ├── parallel-execution.md
│   │   │   ├── question-templates.md
│   │   │   ├── requirements-check.md
│   │   │   └── token-optimization.md
│   │   ├── examples/
│   │   │   └── token-optimization-example.md
│   │   └── tasks/
│   │       └── context.md
│   └── templates/
│       ├── moonshot-output.md
│       ├── moonshot-output.ko.md
│       └── moonshot-output.yaml
└── .history/
```

## 핵심 구성 요소

### 규칙 문서

- `CLAUDE.md`: 전역 규칙과 기본 작업 방식
- `PROJECT.md`: 프로젝트별 규칙 템플릿
- `AGENT.md`: 에이전트 프롬프트 규격

### Moonshot 워크플로우

- `moonshot-orchestrator` 스킬이 요청을 분석하고 최적의 에이전트 체인을 구성합니다.
- 분석 단계는 `moonshot-classify-task`, `moonshot-evaluate-complexity`, `moonshot-detect-uncertainty`, `moonshot-decide-sequence` 스킬로 구성됩니다.

### 에이전트

| 에이전트 | 역할 | 주요 작업 |
|---------|------|----------|
| **Requirements Analyzer** | 요구사항 분석 | 사전 합의서 작성, 요구사항 명확화 |
| **Context Builder** | 구현 계획 수립 | context.md 작성, 단계별 계획 수립 |
| **Implementation Agent** | 코드 구현 | 실제 코드 작성, 패턴 준수 |
| **Verification Agent** | 검증 실행 | typecheck, build, lint 실행 |
| **Documentation Agent** | 문서화 | 세션 로그, 최종 문서화 |
| **Design Spec Extractor** | 디자인 분석 | 디자인 스펙 추출, 입력 데이터 정리 |

### 스킬 라이브러리

- Moonshot 분석: `moonshot-orchestrator`, `moonshot-classify-task`, `moonshot-evaluate-complexity`, `moonshot-detect-uncertainty`, `moonshot-decide-sequence`
- 실행/검증: `implementation-runner`, `codex-validate-plan`, `codex-test-integration`, `claude-codex-guardrail-loop`
- 문서/세션: `doc-sync`, `session-logger`, `efficiency-tracker`, `receiving-code-review`
- 보조 도구: `pre-flight-check`, `design-asset-parser`, `project-md-refresh`

### 문서와 템플릿

- 가이드라인: `docs/guidelines/*.md` (분석, 병렬 실행, 질문 템플릿, 요구사항 체크, 토큰 최적화)
- 예시: `docs/examples/token-optimization-example.md`
- 작업 템플릿: `docs/tasks/context.md`
- 출력 템플릿: `templates/moonshot-output.*`

## 빠른 시작

### 한 줄 설치 (권장)

```bash
curl -fsSL https://raw.githubusercontent.com/munlucky/claude-settings/main/install-claude.sh | bash
```

옵션과 함께 사용:

```bash
# 다운로드 후 실행
curl -fsSL https://raw.githubusercontent.com/munlucky/claude-settings/main/install-claude.sh -o install-claude.sh
chmod +x install-claude.sh

# 기본 실행 (PROJECT.md는 자동으로 제외됨)
./install-claude.sh

# PROJECT.md 포함하여 설치
./install-claude.sh --include-project

# 추가 파일 제외
./install-claude.sh --exclude "*.local.json"

# 미리보기 (실제 변경 없음)
./install-claude.sh --dry-run
```

기본 동작:
- `.claude`, `.codex`, `.gemini` 중 하나라도 존재하면 자동 백업 후 설치
- PROJECT.md는 기본적으로 제외되어 기존 프로젝트 설정이 보호됨

보호되는 사용자 파일 패턴:
```
PROJECT.md
*.local.json
*.local.yaml
*.local.md
settings.local.*
custom/
.env*
```

### PROJECT.md 자동 생성/갱신

설치 후 `.claude/PROJECT.md`가 없다면 `project-md-refresh` 스킬을 실행해 프로젝트 분석 기반으로 생성하거나 갱신할 수 있습니다.

예시:
- Claude Code에 이 저장소에서 `project-md-refresh`를 실행해달라고 요청

### 수동 설치

```bash
# 1. .claude 폴더 복사
cp -r claude-settings/.claude /your-project/

# 2. PROJECT.md 커스터마이징
# 프로젝트 개요, 스택, 규칙 등을 프로젝트에 맞게 수정
```

### 부분 적용

```bash
# 스킬만 설치 (agents, docs 제외)
./install-claude.sh --exclude "agents" --exclude "docs"

# 로컬 설정 파일 제외
./install-claude.sh --exclude "*.local.json"

# 또는 수동 복사
cp -r claude-settings/.claude/skills/moonshot-orchestrator /your-project/.claude/skills/
```

### .codex 설정 (선택)

설치 마지막에 `.codex` 폴더 설정을 묻는 프롬프트가 표시됩니다. `y`를 선택하면 다음 구조가 생성됩니다.

```
.codex/
├── CODEX.md         # 심볼릭 링크 → .claude/CLAUDE.md
├── PROJECT.md       # 복사본 (수정 가능)
└── README.md        # Codex MCP 활용 가이드
```

Codex MCP 활용:
- 계획 검증: `codex-validate-plan`
- 코드 리뷰: `codex-review-code`
- 통합 테스트 검증: `codex-test-integration`

### 다음 단계

1. `.claude/PROJECT.md`를 프로젝트에 맞게 수정
2. Git에 커밋: `git add .claude && git commit -m "Add Claude Code settings"`
3. Claude Code에서 작업을 요청하면 Moonshot 워크플로우가 자동 실행

## Moonshot 워크플로우 v2 요약

- 병렬 실행: 계획 검증과 구현을 동시에 진행
- Doc Sync: 문서 자동 동기화로 피드백 루프 유지
- Completion Check: 요구사항 누락 방지

자세한 내용은 `.claude/README.md`를 참고하세요.

## 설정 커스터마이징

### settings.local.json

현재 저장소의 로컬 설정 예시:

```json
{
  "permissions": {
    "allow": [
      "Bash(tree:*)",
      "WebFetch(domain:exhibition-admin-api-docs)",
      "Bash(cat:*)",
      "Bash(npm run typecheck:*)",
      "Bash(npx tsc:*)",
      "Bash(npm run lint:*)",
      "Bash(mkdir:*)",
      "Bash(npm run build:*)",
      "Bash(git add:*)",
      "Bash(git checkout:*)",
      "Skill(codex-claude-loop)",
      "mcp__codex__spawn_agent",
      "Skill(claude-codex-guardrail-loop)",
      "Bash(awk:*)",
      "Bash(xargs:*)",
      "Bash(find:*)",
      "Bash(git log:*)",
      "Bash(npm run:*)",
      "Bash(jq:*)",
      "Bash(python3:*)",
      "Bash(chmod:*)"
    ],
    "deny": [],
    "ask": []
  }
}
```

## 버전 관리

- `.history/`에 파일 변경 히스토리 저장
- 주요 설정 파일의 이전 버전 추적 가능

## 라이선스

이 프로젝트는 개인 및 상업적 용도로 자유롭게 사용할 수 있습니다.

## 기여

개선 사항이나 버그 리포트는 이슈로 남겨주세요.
