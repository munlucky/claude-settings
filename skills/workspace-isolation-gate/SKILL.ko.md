---
name: workspace-isolation-gate
description: strict 구현 실행 전에 격리 작업공간 설정과 베이스라인 증거를 확인할 때 사용합니다.
---

# 작업공간 격리 게이트

## 역할
strict 또는 phase 기반 작업에서 구현 전에 브랜치/작업공간 격리, agent config hydration, baseline evidence를 강제합니다.

strict 구현 흐름에서 Ready / Isolate stage의 기본 게이트입니다.

## 사용 시점
- 첫 `implementation-runner` 직전.
- `workflowProfile == strict`일 때 필수.
- 기존 안전한 execution workspace가 문서화되지 않은 phase 기반 작업에서 필수.

## 입력
- `analysisContext.repo.gitBranch`
- `analysisContext.repo.gitStatus`
- `analysisContext.signals.workflowProfile`
- `analysisContext.notes`
- worktree prepare evidence notes 또는 artifacts

## 게이트 로직
1. `workflowProfile != strict`이고 phase 기반 작업도 아니면 차단하지 않고 메모만 남깁니다.
2. 브랜치 안전성 검사:
   - notes에 사용자 명시 승인 기록이 없는 상태에서 브랜치가 `main` 또는 `master`면 차단.
3. 구체적인 격리 증거 검사:
   - branch 또는 worktree 식별자 필요.
   - worktree를 쓰면 `.worktrees` 또는 project-local worktree ignore 확인 필요.
   - downstream worktree의 agent config source 필요.
   - 대상 프로젝트가 agent config를 ignore하는 경우 `.claude`, `.agents`, `.codex` ignore 감지 결과 필요.
   - hydration 이후 `.claude/CLAUDE.md`, `.claude/skills`, `<MOONSHOT_RELAY_HOME>/scripts`, `.codex/skills`, `AGENTS.md`가 worktree에서 사용 가능한지 필요.
   - dependency/setup command 또는 "setup not required" 메모 필요.
   - baseline verification command 필요.
   - baseline exit code 필요.
   - baseline log 또는 artifact path 필요.
4. dirty 상태 처리:
   - `gitStatus=dirty` 자체는 즉시 실패가 아니지만, 변경이 의도된 상태라는 notes 근거가 필요.

## 출력 (patch)
```yaml
signals:
  isolatedWorkspaceReady: true
notes:
  - "workspace-isolation-gate: passed (strict)"
workspaceIsolation:
  branchOrWorktree: ""
  worktreeIgnoreChecked: true
  worktreePathIgnored: true
  agentConfigSource: ""
  ignoredAgentPaths: []
  hydratedAgentConfig: true
  setupCommand: ""
  baselineCommand: ""
  baselineExitCode: 0
  baselineArtifact: ""
  prepareArtifact: ".claude/worktree-prepare.json"
```

차단 예시:
```yaml
phase: planning
signals:
  isolatedWorkspaceReady: false
missingInfo:
  - category: workspace-isolation
    priority: HIGH
    question: "branch/worktree 식별자, agent config source, ignore 감지 결과, hydration 상태, setup command, baseline command, exit code, artifact를 기록해 주세요."
    reason: "strict 또는 phase 기반 작업은 구현 전 agent harness가 실제로 동작 가능한 worktree evidence가 필요합니다."
notes:
  - "workspace-isolation-gate: blocked (missing isolation evidence)"
```

## 규칙
- 특정 디렉토리 경로를 강제하지 않습니다.
- 격리 불변조건과 baseline evidence를 강제합니다.
- 새 worktree가 필요하면 설치된 worktree preparation entrypoint를 우선 사용합니다. 사용할 수 없으면 동일한 invariant에 대한 수동 hydration evidence를 기록합니다.
- `.claude/logs`, `.claude/cache`, `.claude/memory.json`, `.claude/memorygraph/`, `.codex/auth.json`, runtime verdict/cache state는 worktree로 복사하지 않습니다.
- 하네스 repo 작업과 downstream 제품 작업을 구분합니다. 하네스 repo 작업은 tracked `.claude` source를 기준으로 볼 수 있지만, downstream 작업은 보통 ignored agent-config hydration이 필요합니다.
- leased worktree escape, generated-state promotion into source, runtime DB/verdict package inclusion, unauthorized account-root mutation은 clean completion을 차단하는 sandbox violation입니다.
- runtime-state를 사용할 수 있으면 `<MOONSHOT_RELAY_HOME>/tools/sandbox/policy.mjs check --json` 또는 source checkout equivalent로 protected path와 approval-required operation을 분류합니다.
- sandbox artifact는 leased disposable root 아래에 두고 source 또는 package payload로 승격하지 않습니다.
- 차단 시 구현 진행을 멈춥니다.
