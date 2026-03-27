# Claude Settings

> Claude Code를 위한 프로젝트 설정과 Moonshot 워크플로우 템플릿 모음

## 개요

이 저장소는 Claude Code에서 사용할 규칙, 에이전트, 스킬, 문서 템플릿을 한곳에서 관리합니다. 다양한 프로젝트에 재사용 가능한 워크플로우를 제공하고, 설치 스크립트로 손쉽게 배포할 수 있습니다.

## 구성 요약

- `.claude/`에 규칙, 에이전트, 스킬, 문서, 템플릿을 집중 관리
- 대부분의 문서는 `.md`(영문)와 `.ko.md`(한글) 쌍으로 제공
- `install-claude.sh`로 다른 프로젝트에 빠르게 설치
- 기존 Moonshot 개발 실행 체인 앞에 제품 정의용 산출물 체인을 추가할 수 있음
- 장시간 앱 개발용 `Sprint Contract -> QA Report -> Handoff` 브리지 아티팩트를 포함해 planner/generator/evaluator 분리를 강화
- `docs/implementation/`에 메타 워크플로우 개선 계획 문서를 보관

## 디렉터리 구조

```
claude-settings/
├── install-claude.sh
├── README.md
├── .claude/
│   ├── CLAUDE.md / CLAUDE.ko.md
│   ├── PROJECT.md / PROJECT.ko.md
│   ├── AGENTS.md / AGENT.ko.md
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
│   │   ├── product-orchestrator/
│   │   ├── product-gate-reviewer/
│   │   ├── task-slicer/
│   │   ├── assumption-ledger/
│   │   ├── moonshot-orchestrator/
│   │   ├── moonshot-classify-task/
│   │   ├── moonshot-evaluate-complexity/
│   │   ├── moonshot-detect-uncertainty/
│   │   ├── moonshot-decide-sequence/
│   │   ├── pre-flight-check/
│   │   ├── karpathy-execution-gate/
│   │   ├── implementation-runner/
│   │   ├── codex-validate-plan/
│   │   ├── codex-test-integration/
│   │   ├── codex-review-code/
│   │   ├── claude-codex-guardrail-loop/
│   │   ├── doc-sync/
│   │   ├── efficiency-tracker/
│   │   ├── session-logger/
│   │   ├── design-asset-parser/
│   │   ├── receiving-code-review/
│   │   └── project-md-refresh/
│   ├── docs/
│   │   ├── guidelines/
│   │   │   ├── product-definition-workflow.md
│   │   │   ├── analysis-guide.md
│   │   │   ├── parallel-execution.md
│   │   │   ├── question-templates.md
│   │   │   ├── requirements-check.md
│   │   │   └── token-optimization.md
│   │   └── tasks/
│   │       └── context.md
│   └── templates/
│       ├── product-definition/
│       ├── moonshot-output.md
│       ├── moonshot-output.ko.md
│       └── moonshot-output.yaml
└── .history/
```

## 핵심 구성 요소

### 규칙 문서

- `CLAUDE.md`: 전역 규칙과 기본 작업 방식
- `PROJECT.md`: 프로젝트별 규칙 템플릿
- `AGENTS.md`: 에이전트 프롬프트 규격

### Moonshot 워크플로우

- 기본 공개 workflow 진입점은 `product-orchestrator`, `moonshot-phase-runner`, `moonshot-orchestrator` 3개입니다.
- 보조 공개 유틸리티 진입점으로 `session-logger`, `commit-moonshot`를 직접 호출할 수 있습니다.
- `moonshot-orchestrator`는 bounded code work의 기본 진입점으로 동작합니다.
- large, phase 기반, long-running 작업은 `moonshot-phase-runner`를 기본 진입점으로 사용합니다.
- 오케스트레이터는 먼저 `executionPlane`을 `read_only`, `product_project`, `meta_harness`로 분류합니다.
- downstream 프로젝트 작업에서는 `project-contract-gate`, `context-readiness-gate`, `verification-contract-gate`가 최소 맥락과 검증 계약을 확인합니다.
- 분석 단계는 `moonshot-classify-task`, `moonshot-evaluate-complexity`, `moonshot-detect-uncertainty`, `moonshot-decide-sequence`로 구성되지만, 이들은 공개 진입점이 아니라 orchestrator 내부 마이크로스킬입니다.
- medium/complex 체인에서는 `karpathy-execution-gate`로 구현 직전 4원칙(코딩 전 사고, 단순함 우선, 최소 변경, 목표 중심 실행)을 점검합니다.
- 구현 뒤에는 `code-simplifier`를 넣어 최근 수정 코드의 가독성과 구조를 정리한 뒤 검증/리뷰로 넘깁니다.
- React/UI 구현 작업에서는 `frontend-design`을 구현 직전에 주입해 시각 방향과 안티패턴을 먼저 정리할 수 있습니다. 프로젝트별 디자인 컨텍스트가 없으면 `teach-impeccable`를 먼저 실행합니다.
- 검증 계층은 `verification-agent`, `completion-verifier`, `browser-verifier`, `codex-review-code`, `security-reviewer`로 조합하며, 필요 시 `qa-flow`를 명시적으로 후속 실행합니다.
- 문서 계층은 `doc-auto-sync`, `session-logger`, `documentation-agent`를 doc-ops bundle로 묶어 취급합니다.
- 사용자가 특정 스킬을 직접 지정한 경우나 read-only 요청, 오케스트레이터 자체 수정 작업에서는 direct invocation bypass가 허용됩니다.

### Product Definition 레이어

- `product-orchestrator`가 아이디어를 `PRODUCT_INTENT -> PRD -> SOLUTION -> SPEC -> PLAN` 체인으로 정리합니다.
- `product-gate-reviewer`는 문서 품질 자체보다 다음 단계로 넘길 수 있는지를 `pass / conditional_pass / fail`로 판정합니다.
- `task-slicer`는 `PLAN.md`를 vertical slice 기반 `tasks/*.md`로 분해합니다.
- `assumption-ledger`는 질문이 필요한 모호함을 `ASSUMPTIONS.md` 또는 `BLOCKERS.md`로 적재해 workflow 정지를 줄입니다.
- medium/complex 구현은 slice별 `SPRINT_CONTRACT.md`를 먼저 만들고, 검증 결과는 `QA_REPORT.md`, 장시간 세션 상태는 `HANDOFF.md`로 남기는 것을 권장합니다.
- phase 기반 장시간 실행의 기본 진입점은 `/moonshot-phase-runner <plan-dir>`이며, 내부적으로 `moonshot-phase-executor`가 `delegated-terminal`과 `in-session-coordinator`를 내부 skill 경계 뒤에서 분기합니다.
- `<plan-dir>`를 생략하면 기존 안전한 plan dir를 재사용하고, 없으면 `moonshot-plan-writer`로 `docs/implementation`을 자동 생성한 뒤 이어서 실행합니다.
- 기본적으로 `/moonshot-phase-runner <plan-dir>` 한 번이면 준비 후 실행까지 이어지고, 수동 중단이 필요할 때만 `--prepare-only`를 사용합니다.

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

- Product Definition: `product-orchestrator`, `product-gate-reviewer`, `task-slicer`, `assumption-ledger`
- 공개 진입점: `product-orchestrator`, `moonshot-phase-runner`, `moonshot-orchestrator`
- 보조 공개 유틸리티: `session-logger`, `commit-moonshot`
- 내부 분석 cluster: `moonshot-classify-task`, `moonshot-evaluate-complexity`, `moonshot-detect-uncertainty`, `moonshot-decide-sequence`
- 실행/검증 cluster: `karpathy-execution-gate`, `implementation-runner`, `code-simplifier`, `verification-agent`, `completion-verifier`, `browser-verifier`, `codex-review-code`, `security-reviewer`, `qa-flow`
- UI 디자인 cluster: `frontend-design`, `teach-impeccable`, `audit`, `normalize`, `polish`
- 문서/doc-ops cluster: `doc-auto-sync`, `session-logger`, `documentation-agent`
- 보조 도구: `pre-flight-check`, `project-contract-gate`, `context-readiness-gate`, `verification-contract-gate`, `design-asset-parser`, `project-md-refresh`, `build-error-resolver`
- non-default / deprecated 후보: `efficiency-tracker`, `workflow-self-improver`

### 문서와 템플릿

- 가이드라인: `docs/guidelines/*.md` (분석, 병렬 실행, 질문 템플릿, 요구사항 체크, 토큰 최적화)
- 제품 정의 가이드: `docs/guidelines/product-definition-workflow.md`
- 장시간 하네스 가이드: `.claude/docs/guidelines/long-running-harness.ko.md`
- 작업 문서 루트: `.claude/docs/tasks/`
- 제품 정의 템플릿: `templates/product-definition/*.md`
- 실행 브리지 템플릿: `.claude/templates/execution/*.md`
- phase internal adapter: `.claude/scripts/moonshot-phase-dispatch.sh`
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

설치 후 프로젝트 부트스트랩 문서 세트가 비어 있다면 `project-md-refresh` 스킬을 실행해 프로젝트 분석 기반으로 생성하거나 갱신할 수 있습니다.

기본 대상 문서:
- `.claude/PROJECT.md`
- `workflow/README.md`
- `docs/design/README.md`
- `docs/glossary/README.md`
- `docs/daily/README.md`
- `TEST_GUIDE.md`
- `docs/analysis/README.md`

추가로 downstream 프로젝트 구현 전에 다음 readiness gate를 통과하는 구성을 권장합니다.

- `project-contract-gate`: `.claude/PROJECT.md` 최소 계약 확인
- `context-readiness-gate`: `context.md` 최소 섹션 확인
- `verification-contract-gate`: `.claude/verification.contract.yaml` 또는 동등한 검증 정책 확인

예시:
- Claude Code에 이 저장소에서 `project-md-refresh`를 실행해달라고 요청

### 수동 설치

```bash
# 1. .claude 폴더 복사
cp -r claude-settings/.claude /your-project/

# 2. 부트스트랩 문서 커스터마이징
# PROJECT.md와 workflow/design/glossary/daily/test/analysis 문서를 프로젝트에 맞게 수정
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

직접 스킬을 지정해서 실행하는 경우:
- review-only, read-only, meta-harness 수정은 direct invocation이 가능
- 일반적인 bounded code work는 `moonshot-orchestrator`를 기본 진입점으로 두는 편이 안전
- large 또는 phase 기반 작업은 `moonshot-phase-runner`를 먼저 타는 편이 안전
- UI 리디자인/감리 작업은 `/audit`, `/normalize`, `/polish` 같은 직접 스킬 호출도 자연스럽습니다.

## Moonshot 워크플로우 v2 요약

- 병렬 실행: 독립 단계만 병렬화(리뷰/로깅/일부 검증), 계획 검증과 구현은 순차 진행
- Karpathy Gate: 구현 직전 실행 규율 점검으로 과설계/스코프 이탈 방지
- Doc Sync: 문서 자동 동기화로 피드백 루프 유지
- Completion Check: 요구사항 누락 방지
- Product Definition Layer: 제품 정의 산출물을 먼저 고정한 뒤 기존 구현 체인으로 핸드오프

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
      "mcp__codex__spawn_agent",
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

## 라이선스

이 프로젝트는 개인 및 상업적 용도로 자유롭게 사용할 수 있습니다.

## 기여

개선 사항이나 버그 리포트는 이슈로 남겨주세요.
