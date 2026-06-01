# Moonshot Relay

> Claude Code와 Codex를 위한 Moonshot workflow harness 플러그인

## 개요

이 저장소는 Claude Code와 Codex에서 사용할 규칙, 에이전트, 스킬, 문서 템플릿을 한곳에서 관리하는 Moonshot workflow harness입니다. 다양한 프로젝트에 재사용 가능한 워크플로우를 제공하고, 플러그인 manifest와 설치 스크립트로 배포할 수 있습니다.

## 구성 요약

- canonical source는 `skills/`, `agents/`, `rules/`, `scripts/`, `bin/`, `tools/`, `schemas/`, `templates/`, `tests/`, `docs/public/`에서 관리하고, `.claude/`는 개발 profile 및 downstream compatibility wrapper로 유지
- 대부분의 문서는 `.md`(영문)와 `.ko.md`(한글) 쌍으로 제공
- `install-claude.sh`로 다른 프로젝트에 빠르게 설치
- compatibility window 동안 downstream 설치는 계속 `.claude/` payload를 생성하지만, 이 저장소의 source of truth는 root-level source directory입니다
- 기존 Moonshot 개발 실행 체인 앞에 제품 정의용 산출물 체인을 추가할 수 있음
- 장시간 앱 개발용 `Sprint Contract -> QA Report -> Handoff` 브리지 아티팩트를 포함해 planner/generator/evaluator 분리를 강화
- phase 기반 작업이 필요할 때 `docs/implementation/`를 런타임에 생성해 사용
- `.claude/docs/tasks/`, `.claude/docs/phase-status.yaml`, `.claude/docs/reports/*.json`, `.claude/verification-results-*`, `.claude/verification-verdict-*`, `.claude/docs/moonshot-analysis.yaml` 같은 런타임 산출물은 버전 관리/설치 배포 대상이 아님
- 프로젝트 로컬 메모리는 MemoryGraph를 기본 backend로 사용하며 `.claude/memorygraph/`에 저장하고 버전 관리/기본 agent context에서 제외
- 코드 구조 분석은 `code-review-graph` MCP를 stage-gated + lazy update 방식으로 사용하며 `.code-review-graph/`에 저장하고 자동 build/watch 없이 실행

## Repository Source Model

- Canonical source: `skills/`, `agents/`, `rules/`, `scripts/`, `bin/`, `tools/`, `schemas/`, `templates/`, `tests/`, `tests/fixtures/`, `docs/public/`
- Development profile: `.claude/` and `.codex/` for local agent runtime compatibility
- Package payloads: `package/claude/profile/`, `package/codex/profile/`, `.claude-plugin/`, `.codex-plugin/`
- Generated state: `.moonshot-state/`, `.claude/logs/`, `.claude/cache/`, `.claude/traces/`, `.claude/browser-artifacts/`, `.claude/browser-runtime/`, `.claude/memorygraph/`, sqlite files, and verdict JSON

Do not add durable source under `.claude/skills`, `.claude/agents`, `.claude/scripts`, `.claude/bin`, `.claude/tools`, `.claude/schemas`, or `.claude/templates`. Add or modify reusable assets in the canonical root directory first, then refresh generated profile output or compatibility wrappers through the package/materialization flow.

Compatibility wrappers and installed-runtime docs may still mention `.claude/...` during the deprecation window. Those references describe downstream payload behavior, not repository source ownership. See `docs/public/repository-layout.md`, `docs/public/installer-usage.md`, and `docs/public/compatibility-migration.md`.

## 디렉터리 구조

```text
moonshot-relay/
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
│       └── runtime-parity-reference-plan/
└── AGENTS.md -> .claude/CLAUDE.md
```

Root-level `skills/`, `agents/`, `rules/`, `scripts/`, `bin/`, `tools/`, `schemas/`, `templates/`, `tests/`, and `docs/public/` are the canonical source directories. The `.claude/` tree remains loaded for current runtime compatibility and installed `.claude/` payload behavior.

Regression fixture JSON and sample artifacts belong under `tests/fixtures/`; they are not runtime output and are not included in installed package payloads.

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
- 작업 문서 루트: `.claude/docs/tasks/` (런타임 생성, 저장소/설치 패키지에는 템플릿만 유지)
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
curl -fsSL https://raw.githubusercontent.com/munlucky/moonshot-relay/main/install-claude.sh | bash
```

옵션과 함께 사용:

```bash
# 다운로드 후 실행
curl -fsSL https://raw.githubusercontent.com/munlucky/moonshot-relay/main/install-claude.sh -o install-claude.sh
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
- `.codex/config.toml` 중 존재 항목은 자동 백업 후 설치
- `.codex/agents/`, `.codex/skills/`는 백업하지 않고 최신 복사본으로 교체
- `.claudeignore`는 기본 denylist를 설치하고 기존 파일이 있으면 병합
- `.gitattributes`는 LF 줄바꿈 정책을 설치하고 기존 파일이 있으면 병합
- PROJECT.md는 기본적으로 제외되어 기존 프로젝트 설정이 보호됨
- canonical `skills/`와 migration profile output을 프로젝트 `.codex/skills/*`에 디렉터리 복사 설치
- Codex 전역 스킬 경로 `${CODEX_GLOBAL_HOME:-${CODEX_HOME:-$HOME/.codex}}/skills/*`는 수정하지 않음
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
cp -r moonshot-relay/.claude /your-project/
cp moonshot-relay/.claudeignore /your-project/

# 2. AGENTS 브리지 구성
mkdir -p /your-project/.agents
rm -rf /your-project/.agents/skills
ln -s .claude/CLAUDE.md /your-project/AGENTS.md

# 3. Codex 프로젝트 설정 복사
cp -r moonshot-relay/.codex /your-project/

# 4. 부트스트랩 문서 커스터마이징
# PROJECT.md와 workflow/design/glossary/daily/test/analysis 문서를 프로젝트에 맞게 수정
```

### 부분 적용

```bash
# 스킬만 설치 (agents, docs 제외)
./install-claude.sh --exclude "agents" --exclude "docs"

# 로컬 설정 파일 제외
./install-claude.sh --exclude "*.local.json"

# 또는 수동 복사: canonical source나 materialized profile output에서 필요한 스킬만 복사
cp -r moonshot-relay/skills/moonshot-orchestrator /your-project/.claude/skills/
```

### Codex 설정 동기화

설치 스크립트는 `.codex/config.toml`, `.codex/agents/`, `.codex/skills/`를 프로젝트에 실제 파일/디렉터리로 설치합니다. 재설치 시 프로젝트 `.codex/agents/`와 `.codex/skills/` 전체를 백업 없이 제거한 뒤 최신 복사본으로 교체합니다. `.codex/skills/*`는 canonical `skills/`에서 materialized된 프로젝트 로컬 복사본이며, migration 중에는 `.claude/skills/*` compatibility profile output과 동기화될 수 있습니다. Codex 전역 스킬 경로 `${CODEX_GLOBAL_HOME:-${CODEX_HOME:-$HOME/.codex}}/skills/*`는 수정하지 않습니다.

Codex 프로젝트 설정에는 다음이 포함됩니다:
- 기본 승인/샌드박스 정책: `approval_policy = "on-request"`, `sandbox_mode = "workspace-write"`
- MCP 서버 예시: GitHub, Context7, Exa, MemoryGraph 기반 Memory, Playwright, Sequential Thinking
- 로컬 stdio MCP는 `.claude/scripts/codex-mcp-singleton.mjs`를 경유해 같은 프로젝트의 이전 동일 MCP process tree를 새 기동 시 정리합니다.
- 멀티에이전트 기본값: `[agents] max_threads = 6`, `max_depth = 1`
- 커스텀 에이전트: `explorer`, `reviewer`, `docs_researcher`

Codex에서 바로 활용할 수 있는 스킬 예시:
- 계획 검증: `codex-validate-plan`
- 코드 리뷰: `codex-review-code`
- 완료 검증: `completion-verifier`

Memory 설정:
- 기본 memory MCP는 `node .claude/scripts/codex-mcp-singleton.mjs memory -- node .claude/scripts/memorygraph-mcp-wrapper.js`입니다.
- wrapper는 `.claude/memorygraph/`를 생성하고 `MEMORYGRAPH_DATA_DIR`로 주입합니다.
- `memorygraph` 실행 파일이 없으면 `install-claude.sh`가 `pipx install memorygraphMCP`를 시도하며, 실패해도 전체 설치는 계속됩니다.
- 프로젝트 지식그래프는 `node .claude/scripts/memorygraph-project-index.mjs`로 seed를 만들고 `project-memory-refresh`가 현재 프로젝트의 `.claude/memorygraph/`에 반영합니다.
- 범용 하네스 지식은 `promotion-candidates.json` 후보 생성 후 명시 승인된 항목만 `harness-memory-promoter`로 `moonshot-relay` graph에 승격합니다.
- AWTL runtime importer utilities (`.claude/scripts/lib/awtl-runtime-importers.mjs`, `.claude/scripts/awtl-import-trace.mjs`) backfill Codex rollout/session and Claude transcript data into canonical AWTL events while keeping import metadata in `payload`.

Code Review Graph 설정:
- `code-review-graph`는 MemoryGraph를 대체하지 않습니다. MemoryGraph는 작업 기억/정책/결정, `code-review-graph`는 코드 구조/리뷰 영향도/분석 기능을 담당합니다.
- Codex MCP는 `node .claude/scripts/codex-mcp-singleton.mjs code-review-graph -- node .claude/scripts/code-review-graph-mcp-wrapper.js`입니다.
- `install-claude.sh`는 `pipx install "code-review-graph[communities]"`를 best-effort로 시도하고, 자동 `build`, `watch`, `daemon`은 실행하지 않습니다.
- 하네스 stage별 사용 계약은 `.claude/docs/guidelines/code-review-graph-workflow.md`를 따릅니다. 코드 분석, 영향도, blast radius, architecture overview, large function 탐색, 리뷰 컨텍스트 축소가 필요한 stage에서는 broad file read보다 `code-review-graph` MCP를 우선 사용합니다.
- 프로젝트 분석 DB는 `.code-review-graph/`에 저장하며 버전 관리와 기본 agent context에서 제외합니다.

주의:
- 프로젝트 `.codex/skills`는 Codex용 로컬 설치본입니다. truth source는 canonical `skills/`이고, `.claude/skills`는 migration compatibility profile output입니다. Codex Desktop에는 프로젝트 `.codex/skills`만 노출하는 구성이 기본입니다.
- 프로젝트 `.codex/agents`와 `.codex/skills`는 generated copy로 취급하므로 재설치 시 백업하지 않고 최신 복사본만 유지합니다.
- 설치 스크립트는 legacy `.agents/skills`를 제거해 `.agents/skills`와 `.codex/skills`가 동시에 discovery되는 중복 노출을 막습니다.
- 전역 `skills` 루트의 개인/시스템 스킬은 설치 스크립트가 건드리지 않습니다.
- 설치 직후 Codex에 스킬이 중복으로 보이면 새 세션을 열어 project `.codex/skills`만 로드되는지 확인하세요.

### 다음 단계

1. `.claude/PROJECT.md`를 프로젝트에 맞게 수정
2. Git에 커밋: `git add .claude .codex .claudeignore .gitattributes AGENTS.md && git commit -m "Add Claude Code settings"`
3. Claude Code에서 작업을 요청하면 Moonshot 워크플로우가 자동 실행

커밋 시 `.agents/skills`, `.mcp.json`, `.claude/docs/tasks/`, `.claude/docs/phase-status.yaml`, `.claude/docs/reports/*.json`, `.claude/verification-verdict-*`, `.claude/memorygraph/`, `.claude/cache/memorygraph/`는 generated/local runtime 경로이므로 explicit `git add -- <paths>` 목록에 넣지 않습니다.

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
