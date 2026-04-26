# Claude Code Settings Inventory

> 기준 시점: 2026-04-26 KST  
> 대상: `C:\dev\claude-settings` 저장소 번들 + 현재 사용자 Claude Code 설치 상태

## 한 줄 결론

이 세팅은 단순한 규칙 모음이 아니라 **제품 정의 -> 실행 계획 -> 격리 실행 -> 리뷰 -> 검증 -> 문서화**를 연결한 Claude Code 운영 하네스다. 강점은 스킬 수가 많은 점이 아니라, `workflow-bundles.yaml`, `verification.contract.yaml`, phase runner, MCP, hooks, installer가 한 흐름으로 묶여 있다는 점이다.

## 요약 수치

| 영역 | 수량 | 기준 |
| --- | ---: | --- |
| Skills | 48 | `.claude/skills/*/SKILL.md`가 있는 디렉터리 기준, 번역/보조 `.md` 제외 |
| Agents | 10 | `.claude/agents/*.md`, `.ko.md` 번역본 제외 |
| Agent 보조 디렉터리 | 4 | `context-builder`, `documentation`, `requirements-analyzer`, `verification` |
| MCP Servers | 2 | `claude mcp list` 연결 상태 기준 |
| Plugins | 10 unique / 11 install records | `claude plugin list`, 중복 scope 포함 시 11 |
| Enabled plugin records | 9 | user/project scope 중 enabled 항목 |
| Disabled plugin records | 2 | `playwright`, `ralph-loop` |
| Hooks | 3 events / 3 commands | `.claude/settings.local.json` |
| Workflow bundles | 9 | `.claude/config/workflow-bundles.yaml`의 `bundleExpansion` |
| Scripts | 51 root / 58 recursive | `.claude/scripts/*`, `.claude/scripts/**/*` 파일 기준 |

## Truth Sources

| 구분 | 확인 위치 |
| --- | --- |
| 저장소 번들 | `.claude/skills`, `.claude/agents`, `.claude/config/workflow-bundles.yaml`, `.claude/verification.contract.yaml` |
| 프로젝트 로컬 설정 | `.claude/settings.local.json`, `.claude/.mcp.json` |
| 사용자 전역 설정 | `%USERPROFILE%\.claude\settings.json` |
| 실제 MCP 연결 | `claude mcp list` |
| 실제 플러그인 설치 | `claude plugin list`, `%USERPROFILE%\.claude\plugins\installed_plugins.json` |
| 설치/배포 동작 | `install-claude.sh`, `README.md` |

주의: 사용자 전역 `settings.json`에는 인증 토큰이 평문으로 존재한다. 이 문서는 토큰 값을 기록하지 않는다.

## 현재 Runtime 상태

| 항목 | 값 |
| --- | --- |
| Claude Code version | `2.1.92` |
| 기본 model | `opus` |
| effortLevel | `high` |
| autoUpdatesChannel | `latest` |
| minimumVersion | `2.1.12` |
| Base URL | 로컬 브리지 `http://127.0.0.1:3000` |
| 비필수 트래픽 | `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1` |
| 위험 권한 프롬프트 | `skipDangerousModePermissionPrompt=true` |

판단: 로컬 브리지 중심의 고출력/장시간 작업 세팅이다. 다만 전역 권한 allow list가 넓고 위험 프롬프트가 꺼져 있어, 공개 배포용 기준으로는 별도 hardening profile을 분리하는 편이 안전하다.

## Architecture Map

```text
사용자 요청
  -> product-orchestrator         # 아이디어/요구사항을 제품 산출물로 고정
  -> moonshot-orchestrator        # bounded implementation control plane
  -> moonshot-phase-runner        # large/phase/long-running control plane
  -> ready/isolate gates          # project/context/verification contract 확인
  -> implementation bundle        # memory check, Karpathy gate, implementation, simplification
  -> review bundle                # code/security/UI guideline review
  -> verification bundle          # browser/runtime/completion evidence
  -> finish bundle                # doc sync, session logging, handoff
```

핵심 설계 선택:

- **Public entrypoint 분리**: `product-orchestrator`, `moonshot-orchestrator`, `moonshot-phase-runner`.
- **Micro-skill 조합**: 작은 스킬을 무작정 합치지 않고 stage owner와 optional bundle로 묶는다.
- **Evidence-first 완료**: completion claim은 fresh verification evidence 이후로 제한한다.
- **Phase runner continuity**: 장시간 phase 작업은 `moonshot-phase-dispatch.sh`와 agent-loop 계열 스크립트로 이어간다.
- **문서 추적성**: `SPRINT_CONTRACT.md`, `QA_REPORT.md`, `HANDOFF.md`, `SCORECARD.md` 같은 산출물로 완료 근거를 남긴다.

## Skills

카운트 기준은 skill 디렉터리 단위다. `.claude/skills` 아래 Markdown 파일 전체는 165개이고, 이 중 `*.ko.md`는 56개지만, 실제 skill 수는 `SKILL.md`를 가진 디렉터리 48개로 본다.

### 공개 진입점

- `product-orchestrator`: 아이디어를 `PRODUCT_INTENT -> PRD -> SOLUTION -> SPEC -> PLAN`으로 정리.
- `moonshot-orchestrator`: 충분한 맥락이 있는 bounded implementation 기본 진입점.
- `moonshot-phase-runner`: large, phase-based, long-running 작업 기본 진입점.

### 공개 유틸리티

- `commit-moonshot`: 메모리 갱신과 커밋이 명시된 경우 사용.
- `session-logger`: 결정, 이슈, handoff 기록.

### Product Definition

- `assumption-ledger`
- `product-gate-reviewer`
- `task-slicer`
- `plan-ceo-review`
- `plan-eng-review`

### Planning / Gates

- `pre-flight-check`
- `project-contract-gate`
- `context-readiness-gate`
- `verification-contract-gate`
- `design-approval-gate`
- `workspace-isolation-gate`
- `codex-validate-plan`

### Moonshot Analysis

- `moonshot-classify-task`
- `moonshot-evaluate-complexity`
- `moonshot-detect-uncertainty`
- `moonshot-decide-sequence`
- `moonshot-plan-writer`
- `moonshot-phase-executor`
- `moonshot-in-session-coordinator`
- `moonshot-teams-runner`

### Implementation / Refactor

- `karpathy-execution-gate`
- `implementation-runner`
- `test-driven-development`
- `code-simplifier`
- `build-error-resolver`

### Review / Verification

- `codex-review-code`
- `completion-verifier`
- `verification-evidence-gate`
- `browser-verifier`
- `qa-flow`
- `security-reviewer`
- `failure-analyzer`

### UI / Design

- `frontend-design`
- `teach-impeccable`
- `audit`
- `normalize`
- `polish`
- `web-design-guidelines`
- `design-asset-parser`
- `browser-session`

### Docs / Project Memory

- `doc-auto-sync`
- `project-md-refresh`

### Framework-specific

- `vercel-react-best-practices`

## Agents

| Agent | 역할 |
| --- | --- |
| `requirements-analyzer` | 요구사항 분석과 preliminary agreement 작성 |
| `context-builder` | 구현 계획과 `context.md` 작성 |
| `documentation-agent` | 결과 문서화와 세션 로그 정리 |
| `verification-agent` | typecheck/build/lint 등 자동 검증 실행 |
| `design-spec-extractor` | 디자인 자료를 구조화된 스펙으로 변환 |
| `phase-attempt-agent` | 단일 phase attempt를 격리 실행하고 요약 반환 |
| `team-leader-agent` | Agent Teams를 별도 컨텍스트에서 조율 |
| `project-memory-agent` | 프로젝트 메모리를 로드해 main session 맥락 구성 |
| `project-memory-check` | 구현 전 계획과 메모리 규칙 충돌 확인 |
| `project-memory-reviewer` | 변경사항이 프로젝트 메모리/스펙을 위반하는지 리뷰 |

참고: 현재 README의 에이전트 표는 6개 중심으로 요약되어 있어 실제 top-level agent 정의 10개를 모두 반영하지 않는다.

## MCP

### 실제 연결 상태

| 서버 | 상태 | 역할 |
| --- | --- | --- |
| `memory` | Connected | 로컬 memory JSON 기반 장기 맥락 |
| `codex` | Connected | Codex MCP bridge / sub-agent 또는 fallback 실행 표면 |

### 설정 위치 차이

| 위치 | 내용 |
| --- | --- |
| `.claude/.mcp.json` | `codex`, `memory` 서버 정의 |
| `%USERPROFILE%\.claude\settings.json` | 전역 `codex` MCP 정의 |
| 실제 `claude mcp list` | `memory`, `codex` 모두 connected |

판단: 프로젝트 번들이 `memory`를 제공하고, 사용자 전역 설정이 `codex`를 보강하는 형태다.

## Plugins

| Plugin | Scope | Status |
| --- | --- | --- |
| `claude-delegator@jarrodwatts-claude-delegator` | user | enabled |
| `claude-ultimate-hud@claude-ultimate-hud` | user | enabled |
| `code-review@claude-plugins-official` | user | enabled |
| `code-simplifier@claude-plugins-official` | project | enabled |
| `code-simplifier@claude-plugins-official` | user | enabled |
| `feature-dev@claude-plugins-official` | user | enabled |
| `frontend-design@claude-plugins-official` | user | enabled |
| `playwright@claude-plugins-official` | user | disabled |
| `ralph-loop@claude-plugins-official` | user | disabled |
| `security-guidance@claude-plugins-official` | user | enabled |
| `typescript-lsp@claude-plugins-official` | user | enabled |

Known marketplaces:

- `claude-plugins-official`
- `claude-ultimate-hud`
- `jarrodwatts-claude-delegator`
- `thedotmack`

판단: UI, 코드 리뷰, 보안, TypeScript LSP, delegation, status line HUD가 주축이다. `playwright`는 설치되어 있지만 비활성 상태라 browser verification은 저장소의 `browser-verifier`/스크립트 경로와 별도로 봐야 한다.

## Hooks

| Event | Matcher | Command | 목적 |
| --- | --- | --- | --- |
| `SessionStart` | `startup` | `bash ".claude/scripts/check-mcp.sh"` | 세션 시작 시 MCP 상태 점검 |
| `Notification` | 전체 | `node .claude/scripts/notify.cjs` | 알림 처리 |
| `PostToolUse` | `Edit` + `*.ts`/`*.tsx` | inline bash + `npx tsc --noEmit` | TS/TSX 편집 직후 관련 타입 에러 표면화 |

판단: hooks는 과하지 않다. 세션 health, notification, TS edit feedback만 잡고 있어 운영 비용 대비 효과가 크다.

## Permissions

프로젝트 로컬 `.claude/settings.local.json`은 다음 계열을 허용한다.

- 파일/탐색: `tree`, `cat`, `ls`, `find`, `awk`, `jq`, `xargs`
- Node/웹 검증: `npm run`, `npx`, `npx tsc`, `npx playwright`, `node`
- Git: `git add`, `git checkout`, `git commit`, `git log`, `git show`
- Claude/Codex: `codex exec`, `codex mcp-server`, `codex login status`, `claude mcp list`, `claude plugin`
- MCP: `mcp__codex__codex`, `mcp__codex__spawn_agent`, `mcp__memory__create_entities`
- Skills: `commit`, `commit-moonshot`, `codex-claude-loop`, `claude-codex-guardrail-loop`

전역 `%USERPROFILE%\.claude\settings.json`은 이보다 훨씬 넓은 Windows/Node/PowerShell 권한과 `skipDangerousModePermissionPrompt=true`를 포함한다.

권장:

- `claude-settings` 저장소용 local profile과 일반 프로젝트용 profile을 분리한다.
- 전역 token/base URL/권한 설정은 public repo 문서에 직접 복제하지 않는다.
- destructive Windows 권한(`taskkill`, broad `powershell.exe:*`, broad `node:*`)은 필요한 프로젝트에서만 local allow로 둔다.

## Installer / 배포 구조

`install-claude.sh`가 이 저장소의 배포 진입점이다.

주요 동작:

- 대상 프로젝트에 `.claude`, `.agents`, `AGENTS.md`, `.claudeignore` 설치.
- 기존 파일은 백업 후 덮어쓰기.
- `PROJECT.md`, `settings.local.*`, `.env*`, `custom/` 등 사용자 파일은 보호.
- 기본적으로 `PROJECT.md`는 제외하고, `--include-project`일 때만 포함.
- `.claude/skills/*`를 Codex 스킬 경로 `${CODEX_HOME:-./.codex}/skills/*`에 연결.
- Windows는 PowerShell이 아니라 Git Bash 실행을 기본 가정.

현재 `.agents/skills`는 실제 symlink가 아니라 `../.claude/skills` 문자열을 담은 17바이트 파일이다. Windows 환경 호환을 고려한 브리지 흔적으로 보이며, 설치 스크립트의 현재 동작과 실제 downstream 적용 결과를 별도로 검증하는 편이 좋다.

## Workflow Bundles

| Bundle | 구성 |
| --- | --- |
| `implementation-lite-bundle` | `implementation-runner` |
| `ready-isolate-bundle` | `pre-flight-check`, `project-contract-gate`, `context-readiness-gate`, `verification-contract-gate` |
| `planning-bundle` | `requirements-analyzer`, `context-builder`, `codex-validate-plan` |
| `implementation-bundle` | `project-memory-check`, `karpathy-execution-gate`, `implementation-runner`, `code-simplifier` |
| `verification-lite-bundle` | `verify-changes.sh` |
| `verification-bundle` | `browser-verifier`, `completion-verifier` |
| `review-bundle` | `codex-review-code`, `security-reviewer`, `audit`, `web-design-guidelines` |
| `finish-bundle` | `doc-auto-sync`, `session-logger` |
| `meta-harness-bundle` | `pre-flight-check`, `project-memory-check`, `karpathy-execution-gate`, `implementation-runner` |

주의: 표의 bundle key는 9개지만, 일반 finish/review/verification 등 실제 stage 조합은 plane과 complexity에 따라 달라진다.

## 강점

1. **Control plane이 분리되어 있다**  
   제품 정의, bounded implementation, phase runner가 섞이지 않는다.

2. **완료 기준이 evidence 중심이다**  
   `completion-verifier`, `verification-evidence-gate`, `verification.contract.yaml`이 완료 주장을 통제한다.

3. **장시간 작업 복구성이 있다**  
   phase state, attempt, dispatch, runtime, archive sync, scorecard 렌더링 스크립트가 갖춰져 있다.

4. **문서화가 사후 장식이 아니다**  
   `doc-auto-sync`, `session-logger`, `HANDOFF`, `QA_REPORT`, `SPRINT_CONTRACT`가 workflow 끝단에 붙어 있다.

5. **Codex fallback/bridge를 전제로 한다**  
   MCP와 installer가 Claude Code 단독이 아니라 Codex 연계를 포함한다.

## 리스크 / 정리 포인트

1. **전역 설정의 보안 표면이 넓다**  
   인증 토큰 평문, broad command allow, dangerous prompt skip이 있다. 개인 장비에서는 편의성이 크지만 공개 템플릿과 분리해야 한다.

2. **README 일부가 실제 inventory보다 작게 요약되어 있다**  
   에이전트 표는 6개 중심인데 실제 top-level agent 정의는 10개다.

3. **Plugin과 Skill 기능이 일부 겹친다**  
   `frontend-design`, `code-simplifier`, `code-review`, `security-guidance`는 플러그인과 로컬 스킬이 겹친다. 우선순위와 호출 기준을 문서화해야 혼선이 줄어든다.

4. **`.agents/skills` 브리지 표현이 Windows에서 애매하다**  
   현재는 symlink가 아니라 텍스트 파일이다. 설치 대상 프로젝트에서 Claude/Codex가 실제로 이를 해석하는지 smoke가 필요하다.

5. **MCP source가 세 군데로 나뉜다**  
   project `.mcp.json`, global `settings.json`, runtime `claude mcp list`를 구분해 봐야 한다.

## 게시물형 요약 초안

```text
내 Claude Code 세팅을 다시 세어보니, 단순히 Skills 몇 개 깔아둔 수준은 아니었다.

📚 현재 구성 요약
- Skills: 48
- Agents: 10
- MCP Servers: 2 connected
- Plugins: 10 unique / 11 install records
- Hooks: 3
- Workflow bundles: 9
- Scripts: 51 root / 58 recursive

구조는 크게 product definition, bounded implementation, phase runner 세 갈래로 나뉜다.
작업은 대략 요구사항 정리 -> context/plan -> isolated execution -> review -> verification -> doc/handoff로 흐르고,
완료 주장은 completion verifier와 evidence gate 뒤에서만 하도록 묶어놨다.

이 세팅의 핵심은 도구 개수가 아니라 연결 방식이다.
Skills, Agents, MCP, Plugins가 각각 따로 노는 게 아니라, workflow-bundles와 verification contract를 통해
어떤 작업에서 어떤 조합을 탈지 결정되도록 해둔 구조다.

그래서 새 AI 도구가 나와도 바로 갈아타기보다, 이 하네스에 어떻게 붙일 수 있는지를 먼저 보게 된다.
```

## 다음 정리 작업 제안

1. README의 에이전트 표를 실제 10개 정의 기준으로 갱신.
2. Plugin vs local Skill 중복 표를 추가해 호출 우선순위 확정.
3. 전역 `settings.json`에서 public-safe template과 private-local profile 분리.
4. `.agents/skills` 브리지의 Windows/Git Bash 실제 동작 smoke 추가.
5. `claude mcp list`, `claude plugin list`, skill/agent count를 자동 산출하는 inventory script 추가.
