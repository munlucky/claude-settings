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
- phase 기반 작업이 필요할 때 `docs/implementation/`를 런타임에 생성해 사용
- `.claude/verification-results-*`, `.claude/verification-verdict-*`, `.claude/docs/moonshot-analysis.yaml` 같은 런타임 산출물은 버전 관리 대상이 아님
- 프로젝트 로컬 메모리는 MemoryGraph를 기본 backend로 사용하며 `.claude/memorygraph/`에 저장하고 버전 관리/기본 agent context에서 제외

## 디렉터리 구조

```text
claude-settings/
├── install-claude.sh
├── README.md
├── .claudeignore
├── .claude/
│   ├── CLAUDE.md / CLAUDE.ko.md
│   ├── PROJECT.md / PROJECT.ko.md
│   ├── README.md / README.ko.md
│   ├── verification.contract.yaml
│   ├── rules/
│   ├── skills/
│   ├── agents/
│   ├── scripts/
│   ├── templates/
│   └── docs/
│       ├── guidelines/
│       ├── reference-downstream/
│       ├── runtime-parity-reference-plan/
│       └── tasks/
└── AGENTS.md -> .claude/CLAUDE.md
```

## 핵심 구성 요소

### 규칙 문서

- `CLAUDE.md`: 전역 규칙과 기본 작업 방식
- `PROJECT.md`: 현재 워크스페이스의 운영 계약 문서
- `AGENTS.md`: 최상위 TOC 겸 브리지 엔트리

### Moonshot 워크플로우

- 기본 공개 workflow 진입점은 `product-orchestrator`, `moonshot-phase-runner`, `moonshot-orchestrator` 3개입니다.
- 보조 공개 유틸리티 진입점으로 `session-logger`, `commit-moonshot`를 직접 호출할 수 있습니다.
- `moonshot-orchestrator`는 bounded code work의 기본 진입점으로 동작합니다.
- large, phase 기반, long-running 작업은 `moonshot-phase-runner`를 기본 진입점으로 사용합니다.
- 오케스트레이터는 먼저 `executionPlane`을 `read_only`, `product_project`, `meta_harness`로 분류합니다.
- downstream 프로젝트 작업에서는 `project-contract-gate`, `context-readiness-gate`, `verification-contract-gate`가 최소 맥락과 검증 계약을 확인합니다.
- 분석 단계는 `moonshot-classify-task`, `moonshot-evaluate-complexity`, `moonshot-detect-uncertainty`, `moonshot-decide-sequence`로 구성되지만, 이들은 공개 진입점이 아니라 orchestrator 내부 마이크로스킬입니다.
- medium/complex 체인에서는 `karpathy-execution-gate`로 구현 직전 4원칙(코딩 전 사고, 단순함 우선, 최소 변경, 목표 중심 실행)을 점검합니다.
- 동작 변경 작업은 내부 `test-driven-development` 스킬로 red/green/refactor evidence를 남깁니다.
- 실제 작업 프로젝트에서 `.claude`, `.agents`, `.codex`가 ignored인 경우 `harness-prepare-worktree`가 worktree 생성 후 필요한 agent config를 hydrate하고 baseline evidence를 남깁니다.
- 구현 뒤에는 `code-simplifier`를 넣어 최근 수정 코드의 가독성과 구조를 정리한 뒤 검증/리뷰로 넘깁니다.
- React/UI 구현 작업에서는 `frontend-design`을 UI bundle의 umbrella로 사용합니다. `teach-impeccable`, `audit`, `normalize`, `polish`는 기본 진입점이 아니라 UI/design bundle 내부 또는 명시적 UI 품질 작업에서만 사용합니다.
- 검증 계층은 `completion-verifier`를 중심으로 `verification-agent`, `browser-verifier`, `codex-review-code`, `security-reviewer`, `qa-flow`를 stage 내부 구성요소로 조합합니다. 완료 주장은 항상 fresh evidence 이후에만 가능합니다.
- 문서 계층은 `session-logger`를 공개 유틸리티로 유지하고, `doc-auto-sync`, `documentation-agent`, `project-md-refresh`는 doc-ops/finish bundle 뒤에 둡니다.
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

### 스킬 라이브러리와 공개 표면

- Product Definition: `product-orchestrator`, `product-gate-reviewer`, `task-slicer`, `assumption-ledger`
- 공개 진입점: `product-orchestrator`, `moonshot-phase-runner`, `moonshot-orchestrator`
- 보조 공개 유틸리티: `session-logger`, `commit-moonshot`
- 내부 분석 cluster: `moonshot-classify-task`, `moonshot-evaluate-complexity`, `moonshot-detect-uncertainty`, `moonshot-decide-sequence`
- 실행/검증 cluster: `karpathy-execution-gate`, `test-driven-development`, `implementation-runner`, `code-simplifier`, `verification-agent`, `completion-verifier`, `browser-verifier`, `codex-review-code`, `security-reviewer`, `qa-flow`
- UI/design optional bundle: `frontend-design` 아래 `teach-impeccable`, `audit`, `normalize`, `polish`, `web-design-guidelines`
- 문서/doc-ops optional bundle: `doc-auto-sync`, `session-logger`, `documentation-agent`, `project-md-refresh`
- 보조 도구: `pre-flight-check`, `project-contract-gate`, `context-readiness-gate`, `verification-contract-gate`, `design-asset-parser`, `project-md-refresh`, `build-error-resolver`
- deprecated / non-default: `efficiency-tracker`, `workflow-self-improver`

공개 표면 상태:
- `public_entrypoint`: 사용자가 workflow 시작점으로 직접 선택하는 스킬
- `public_utility`: 특정 유틸리티 목적에 한해 직접 호출하는 스킬
- `internal_stage_owner`: orchestrator 또는 stage bundle이 호출하는 내부 스킬
- `optional_bundle_member`: UI/browser/doc/verification 같은 task profile에서만 추가되는 스킬
- `deprecated`: 기본 실행 경로에서 제외하고 이력/명시적 유지보수 용도로만 남기는 스킬

### 문서와 템플릿

- 가이드라인: `.claude/docs/guidelines/*.md` (분석, 병렬 실행, 질문 템플릿, 요구사항 체크, 토큰 최적화 등)
- 제품 정의 가이드: `.claude/docs/guidelines/product-definition-workflow.md`
- 장시간 하네스 가이드: `.claude/docs/guidelines/long-running-harness.ko.md`
- 외부 하네스 도입 준비: `docs/claude-tasks/external-harness-adoption/`
- 작업 문서 루트: `.claude/docs/tasks/`
- downstream reference package: `.claude/docs/reference-downstream/`
- runtime parity fixture: `.claude/docs/runtime-parity-reference-plan/`
- 제품 정의 템플릿: `.claude/templates/product-definition/*.md`
- 실행 브리지 템플릿: `.claude/templates/execution/*.md`
- phase internal adapter: `.claude/scripts/moonshot-phase-dispatch.sh`
- worktree prepare adapter: `.claude/scripts/harness-prepare-worktree.sh`
- 출력 템플릿: `.claude/templates/moonshot-output.*`

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

# Windows는 PowerShell이 아니라 Git Bash에서 실행
# Git Bash 예시:
# bash ./install-claude.sh

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
- `.claude`, `.agents`, `AGENTS.md` 중 존재 항목은 자동 백업 후 설치
- `.codex/config.toml`, `.codex/agents/` 중 존재 항목은 자동 백업 후 설치
- `.claudeignore`는 기본 denylist를 설치하고 기존 파일이 있으면 병합
- PROJECT.md는 기본적으로 제외되어 기존 프로젝트 설정이 보호됨
- `.claude/skills/*`를 Codex 스킬 경로 `${CODEX_HOME:-./.codex}/skills/*`에 심볼릭 링크
- Python 3.10+ 환경에서 `pipx install memorygraphMCP`를 자동 시도하고 MemoryGraph MCP를 project scope로 등록

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
# 1. .claude 폴더와 ignore 정책 복사
cp -r claude-settings/.claude /your-project/
cp claude-settings/.claudeignore /your-project/

# 2. agents/AGENTS 브리지 구성
mkdir -p /your-project/.agents
ln -s ../.claude/skills /your-project/.agents/skills
ln -s .claude/CLAUDE.md /your-project/AGENTS.md

# 3. Codex 프로젝트 설정 복사
cp -r claude-settings/.codex /your-project/

# 4. 부트스트랩 문서 커스터마이징
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

### Codex 설정 동기화

설치 스크립트는 `.codex/config.toml`과 `.codex/agents/`를 설치하고, 동시에 `.claude/skills/*`를 Codex가 읽는 스킬 경로 `${CODEX_HOME:-./.codex}/skills/*`에도 심볼릭 링크합니다. `CODEX_HOME`을 지정하지 않으면 현재 프로젝트 루트의 `.codex`를 사용합니다.

Codex 프로젝트 설정에는 다음이 포함됩니다:
- 기본 승인/샌드박스 정책: `approval_policy = "on-request"`, `sandbox_mode = "workspace-write"`
- MCP 서버 예시: GitHub, Context7, Exa, MemoryGraph 기반 Memory, Playwright, Sequential Thinking
- 멀티에이전트 기본값: `[agents] max_threads = 6`, `max_depth = 1`
- 커스텀 에이전트: `explorer`, `reviewer`, `docs_researcher`

Codex에서 바로 활용할 수 있는 스킬 예시:
- 계획 검증: `codex-validate-plan`
- 코드 리뷰: `codex-review-code`
- 완료 검증: `completion-verifier`

Memory 설정:
- 기본 memory MCP는 `node .claude/scripts/memorygraph-mcp-wrapper.js`입니다.
- wrapper는 `.claude/memorygraph/`를 생성하고 `MEMORYGRAPH_DATA_DIR`로 주입합니다.
- `memorygraph` 실행 파일이 없으면 `install-claude.sh`가 `pipx install memorygraphMCP`를 시도하며, 실패해도 전체 설치는 계속됩니다.

주의:
- `.codex/skills`는 재생성 가능한 링크 영역이고, `.codex/config.toml`과 `.codex/agents/`는 관리 대상 설정입니다.
- 같은 이름의 기존 전역 스킬이 있으면 백업 후 교체됩니다.
- 설치 직후 Codex에 스킬이 보이지 않으면 새 세션을 열어 전역 스킬 디렉토리를 다시 로드하세요.

### 다음 단계

1. `.claude/PROJECT.md`를 프로젝트에 맞게 수정
2. Git에 커밋: `git add .claude .agents .claudeignore AGENTS.md && git commit -m "Add Claude Code settings"`
3. Claude Code에서 작업을 요청하면 Moonshot 워크플로우가 자동 실행

직접 스킬을 지정해서 실행하는 경우:
- review-only, read-only, meta-harness 수정은 direct invocation이 가능
- 일반적인 bounded code work는 `moonshot-orchestrator`를 기본 진입점으로 두는 편이 안전
- large 또는 phase 기반 작업은 `moonshot-phase-runner`를 먼저 타는 편이 안전
- UI 리디자인/감리 작업은 먼저 `frontend-design`을 기준으로 잡고, `/audit`, `/normalize`, `/polish`는 명시적인 UI 품질 세부 작업일 때만 optional helper로 호출합니다.

## Moonshot 워크플로우 v2 요약

- 병렬 실행: 독립 단계만 병렬화(리뷰/로깅/일부 검증), 계획 검증과 구현은 순차 진행
- Phase 내부 병렬 구현은 opt-in입니다. `WORKSETS.yaml`에 겹치지 않는 `ownedPaths`를 정의하고 `--parallel-worktrees N`을 넘긴 경우에만 worktree별 병렬 worker를 실행한 뒤 diff 검증/병합 후 기존 phase 검증으로 돌아갑니다.
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
