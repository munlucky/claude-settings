# MemoryGraph 워크플로우 계약

모든 공개 워크플로우 진입점과 Moonshot 단계 경계에서 이 계약을 사용합니다.

## 목표

- 각 단계가 다른 스킬, 에이전트, 실행 adapter에 작업을 넘기기 전에 프로젝트 로컬 MemoryGraph를 조회합니다.
- MemoryGraph context는 `context.project_path`, `context.project_id`, `project:<projectId>`, `source:moonshot`로 프로젝트 범위를 고정합니다.
- system, developer, `AGENTS.md`, `.claude/rules/**`, workflow hard rule과 중복되는 내용을 메인 세션에 다시 싣지 않습니다.
- `.claude/docs/ko/`는 사용자가 읽기 위한 한국어 미러이므로 MemoryGraph 조회/저장 소스에서 제외합니다.
- MemoryGraph 실패는 strict memory validation 단계가 아닌 한 workflow를 막지 않고 warning 또는 `not_checked`로 남깁니다.
- 프로젝트 로컬 지식그래프 생성/갱신은 명시 refresh, finish/session logging, commit-memory 흐름에서만 수행합니다.
- 여러 프로젝트에 재사용 가능한 지식은 승인 기반 승격 경로로만 하네스 graph에 저장합니다.
- Phase 05는 harness-memory-promoter 앞에 replay gate를 추가합니다. 후보는 replay 증거 또는 human approval이 있어야 하며, transcript-only/imported-only 후보는 계속 차단됩니다.
- 턴 실패 재발 방지 memory는 2단계입니다. failed turn case는 로컬 prevention brief에 쓸 수 있지만, MemoryGraph write는 verified replay 또는 명시적 human approval이 있어야 합니다.

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

## 프로젝트 Graph Refresh

프로젝트 graph 데이터는 `claude-settings`가 아니라 활성 프로젝트에 속합니다.

- seed 생성: `node .claude/scripts/memorygraph-project-index.mjs`
- commit refresh helper: `node .claude/scripts/commit-moonshot-memory-refresh.mjs --project-id <projectId>`
- seed 출력: `.claude/cache/memorygraph/project-graph-seed.json`
- 승격 후보: `.claude/cache/memorygraph/promotion-candidates.json`
- write 경로: `project-memory-refresh`, `memoryMode: write_requested`
- data 경로: `<active-project>/.claude/memorygraph/`

인덱서는 운영 중인 프로젝트 파일, package metadata, 하네스 workflow asset, 로컬 참조, import, export symbol, class, function, type, API/route surface에서 semantic node와 relationship을 만듭니다. `.claude/docs/ko/`, `.claude/memorygraph/`, `.git`, dependency, build/cache 산출물은 제외합니다.

## 하네스 지식 승격

재사용 가능한 프로젝트 지식은 `claude-settings` graph로 승격할 수 있지만 자동으로 저장하지 않습니다.

- 프로젝트 refresh는 후보만 생성합니다.
- `harness-memory-promoter`는 반드시 `claude-settings` 저장소에서 실행합니다.
- 승격에는 명시 승인이 필요합니다.
- MemoryGraph가 unavailable이어도 관련 없는 워크플로는 막지 말고, 승격 연산만 실패/차단으로 보고합니다.
- 승격 태그는 `project:claude-settings`, `promoted`, `from-project:<projectId>`, `source:moonshot`을 포함합니다.
- 프로젝트 도메인/비즈니스 로직, 일회성 구현 세부사항, secrets, `.claude/docs/ko/`에서만 나온 사실은 승격하지 않습니다.
- 실패 턴에서 파생된 AWTL promotion candidate는 `failure_turn_id`를 포함해야 합니다.
- imported transcript 또는 raw trace replay만으로 만들어진 후보는 replay evidence 또는 human approval 전까지 거부합니다.
- 직접 MemoryGraph write는 `writeMemoryGraph: true`와 `autoPromote: verified-only`가 함께 있을 때만 유효합니다.
- promotion attempt는 `write_status`, `denial_codes`, compact provenance를 replay scorecard에 append해야 합니다.
- `write_status: skipped`, `not_requested`, `memorygraph_unavailable`은 해당 phase가 strict memory validation을 목표로 하지 않는 한 workflow completion failure가 아닙니다.

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
    graphRelations: []
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
- `memoryMode: verified_write_requested`는 replay 또는 human approval을 통과한 harness-memory-promoter 흐름에서만 사용합니다.
- 일반 하네스 규칙, system prompt 사실, `.claude/docs/ko/`에서만 나온 사실은 저장하지 않습니다.
- MemoryGraph를 사용할 수 없으면 `boundaryStatus: not_checked` 또는 warning을 남기고 workflow를 계속합니다.
- `commit-moonshot`에서 `Transport closed`는 `mcp_transport_failed -> direct_fallback`로 분류합니다. direct fallback 성공은 memory refresh 완료로 취급하고, fallback 실패는 로그에 남기되 명시적 Git closeout을 막지 않습니다.

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
