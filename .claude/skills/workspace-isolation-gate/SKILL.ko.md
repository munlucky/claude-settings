---
name: workspace-isolation-gate
description: strict 구현 실행 전에 격리 작업공간 설정과 베이스라인 증거를 확인할 때 사용합니다.
---

# 작업공간 격리 게이트

## 역할
strict 또는 phase 기반 작업에서 구현 전에 브랜치/작업공간 격리와 baseline evidence를 강제합니다.

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
- baseline evidence notes 또는 artifacts

## 게이트 로직
1. `workflowProfile != strict`이고 phase 기반 작업도 아니면 차단하지 않고 메모만 남깁니다.
2. 브랜치 안전성 검사:
   - notes에 사용자 명시 승인 기록이 없는 상태에서 브랜치가 `main` 또는 `master`면 차단.
3. 구체적인 격리 증거 검사:
   - branch 또는 worktree 식별자 필요.
   - worktree를 쓰면 `.worktrees` 또는 project-local worktree ignore 확인 필요.
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
  setupCommand: ""
  baselineCommand: ""
  baselineExitCode: 0
  baselineArtifact: ""
```

차단 예시:
```yaml
phase: planning
signals:
  isolatedWorkspaceReady: false
missingInfo:
  - category: workspace-isolation
    priority: HIGH
    question: "branch/worktree 식별자, ignore 확인, setup command, baseline command, exit code, artifact를 기록해 주세요."
    reason: "strict 또는 phase 기반 작업은 구현 전 구체적인 workspace prepare/baseline evidence가 필요합니다."
notes:
  - "workspace-isolation-gate: blocked (missing isolation evidence)"
```

## 규칙
- 특정 디렉토리 경로를 강제하지 않습니다.
- 격리 불변조건과 baseline evidence를 강제합니다.
- 이 gate는 worktree를 자동 생성하지 않습니다. 자동 생성은 별도 pilot 후보입니다.
- 차단 시 구현 진행을 멈춥니다.
