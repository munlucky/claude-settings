# MemoryGraph 워크플로우 계약

모든 공개 워크플로우 진입점과 Moonshot 단계 경계에서 이 계약을 사용합니다.

## 목표

- 각 단계가 다른 스킬, 에이전트, 실행 adapter에 작업을 넘기기 전에 프로젝트 로컬 MemoryGraph를 조회합니다.
- MemoryGraph context는 `context.project_path`, `context.project_id`, `project:<projectId>`, `source:moonshot`로 프로젝트 범위를 고정합니다.
- system, developer, `AGENTS.md`, `.claude/rules/**`, workflow hard rule과 중복되는 내용을 메인 세션에 다시 싣지 않습니다.
- `.claude/docs/ko/`는 사용자가 읽기 위한 한국어 미러이므로 MemoryGraph 조회/저장 소스에서 제외합니다.
- MemoryGraph 실패는 strict memory validation 단계가 아닌 한 workflow를 막지 않고 warning 또는 `not_checked`로 남깁니다.

## 단계별 적용

| 단계 | 필수 MemoryGraph 동작 | 담당 |
|---|---|---|
| Intake | `project-memory-agent` read-only 조회로 이전 결정, 도메인 용어, non-goal, 제약을 확인 | 공개 진입점 |
| Plan | product/phase/bounded planning 작업 전에 `project-memory-agent` read-only 조회 | orchestrator |
| Ready / Isolate | 구현 시작 전 `project-memory-check` read-only boundary 점검 | bundle / orchestrator |
| Execute | 구현 위임 전 stage-scoped `projectMemoryContext`를 갱신하고 요약 delta만 전달 | orchestrator / phase coordinator |
| Review | code review 뒤 `project-memory-reviewer`로 boundary/convention 회귀 점검 | review 단계 |
| Verify | 최종 검증 전 verification hint와 release/closeout rule을 read-only 조회 | verification 단계 |
| Finish / Handoff | `session-logger`는 compact reusable fact만 저장 가능, `commit-moonshot`은 명시 호출 시 memory refresh 수행 | finish 단계 |

## 중복 제거 정책

MemoryGraph 결과는 메인 세션에 병합하기 전에 아래 구조로 축약합니다.

```yaml
projectMemoryContext:
  deltas:
    boundaries: []
    conventions: []
    componentRules: []
    priorDecisions: []
    verificationHints: []
  omitted:
    duplicatedSystemRules: []
    humanMirrorDocs:
      - ".claude/docs/ko/"
    staleOrLowConfidence: []
```

raw memory 본문을 `analysisContext`에 복사하지 않습니다. 현재 단계의 판단을 바꿀 수 있는 project-specific delta만 반환합니다.

## 읽기/쓰기 규칙

- 기본 단계 모드는 `memoryMode: read_only`입니다.
- `memoryMode: write_requested`는 `session-logger`, `commit-moonshot`, 또는 명시적인 memory refresh 요청에서만 사용합니다.
- 일반 하네스 규칙, system prompt 사실, `.claude/docs/ko/`에서만 나온 사실은 저장하지 않습니다.
- MemoryGraph를 사용할 수 없으면 `boundaryStatus: not_checked` 또는 warning을 남기고 workflow를 계속합니다.

## Workflow Evidence

비사소한 workflow는 아래 상태를 남겨야 합니다.

```yaml
projectMemory:
  backend: MemoryGraph
  stageCoverage:
    intake: checked | not_checked | skipped
    plan: checked | not_checked | skipped
    ready: checked | not_checked | skipped
    execute: checked | not_checked | skipped
    review: checked | not_checked | skipped
    verify: checked | not_checked | skipped
    finish: checked | not_checked | skipped
  lastStage: intake|plan|ready|execute|review|verify|finish|commit
```

작은 compressed workflow에서 하나의 `project-memory-agent` 조회로 인접 단계를 묶을 수는 있지만, 반환 결과에 어떤 stage를 커버했는지 명시해야 합니다.
