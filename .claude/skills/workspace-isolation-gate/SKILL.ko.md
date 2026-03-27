---
name: workspace-isolation-gate
description: strict 구현 실행 전에 격리 작업공간 설정과 베이스라인 증거를 확인할 때 사용합니다.
---

# 작업공간 격리 게이트

## 역할
strict 모드에서 구현 전에 브랜치/작업공간 격리를 강제합니다.

strict 구현 흐름에서 Ready / Isolate stage의 기본 게이트입니다.

## 사용 시점
- 첫 `implementation-runner` 직전.
- `workflowProfile == strict`일 때 필수.

## 입력
- `analysisContext.repo.gitBranch`
- `analysisContext.repo.gitStatus`
- `analysisContext.signals.workflowProfile`
- `analysisContext.notes`

## 게이트 로직
1. `workflowProfile != strict`이면 차단하지 않고 메모만 남깁니다.
2. 브랜치 안전성 검사:
   - notes에 사용자 명시 승인 기록이 없는 상태에서 브랜치가 `main` 또는 `master`면 차단.
3. 격리 증거 검사 (경로 강제 없음):
   - notes에 아래와 같은 격리/베이스라인 증거 중 최소 1개 필요:
     - `"worktree-ready"` / `"isolated-workspace-ready"`
     - `"baseline-tests-pass"` / `"baseline-verified"`
4. dirty 상태 처리:
   - `gitStatus=dirty` 자체는 즉시 실패가 아니지만, 변경이 의도된 상태라는 notes 근거가 필요.

## 출력 (patch)
```yaml
signals:
  isolatedWorkspaceReady: true
notes:
  - "workspace-isolation-gate: passed (strict)"
```

차단 예시:
```yaml
phase: planning
signals:
  isolatedWorkspaceReady: false
missingInfo:
  - category: workspace-isolation
    priority: HIGH
    question: "격리 브랜치/작업공간 설정과 베이스라인 검증 증거를 확인해 주세요."
    reason: "strict 프로필에서는 구현 전 격리가 필수입니다."
notes:
  - "workspace-isolation-gate: blocked (missing isolation evidence)"
```

## 규칙
- 특정 디렉토리 경로를 강제하지 않습니다.
- 격리 불변조건(브랜치 안전성 + 베이스라인 증거)만 강제합니다.
- 차단 시 구현 진행을 멈춥니다.
