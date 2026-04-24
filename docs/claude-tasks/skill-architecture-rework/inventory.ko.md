# 스킬 아키텍처 재정비 인벤토리

Last-Reviewed: 2026-04-24

## 목적

현재 워크플로우 자산 전체를 구현 전 상태에서 분류한다.

## Tier 규칙

허용 호출 방향:
- Tier 1 -> Tier 2 또는 Tier 3
- Tier 2 -> Tier 3 또는 Tier 4
- Tier 3 -> 실행 도구가 필요한 경우에만 Tier 4
- Tier 4 -> 오케스트레이션 결정 금지

사용자 노출 tier:
- 기본은 Tier 1
- 문서에 명시된 공개 유틸리티는 예외적으로 Tier 1 밖에서도 직접 호출 가능

내부 전용 tier:
- Tier 2
- Tier 3
- Tier 4

## 스킬

| 자산 | Tier | 결정 | 메모 |
|---|---|---|---|
| `product-orchestrator` | Tier 1 | `keep` | 제품 정의 진입점. |
| `moonshot-phase-runner` | Tier 1 | `keep` | 대형 작업과 phase 기반 작업의 진입점. |
| `moonshot-orchestrator` | Tier 1 | `keep` | 범위가 정해진 구현 작업 진입점. |
| `moonshot-phase-executor` | Tier 2 | `improve` | 내부 실행 경계로 유지하되 사용자 노출은 줄인다. |
| `moonshot-teams-runner` | Tier 2 | `keep` | 병렬 팀 워크플로우의 조합 표면. |
| `moonshot-in-session-coordinator` | Tier 2 | `keep` | 세션 내 격리 시도를 조정하는 런타임 경로. |
| `moonshot-plan-writer` | Tier 2 | `keep` | phase-runner의 master plan 생성 의존성. |
| `assumption-ledger` | Tier 3 | `keep` | 모호함 처리 역할이 명확하다. |
| `audit` | Tier 3 | `improve` | 유용한 개념이지만 review 계열과 경계를 더 분명히 해야 한다. |
| `browser-session` | Tier 3 | `improve` | 상위 워크플로우가 아니라 browser 보조 스킬로 위치시킨다. |
| `browser-verifier` | Tier 3 | `improve` | 유지하되 verification 조합 아래에 둔다. |
| `build-error-resolver` | Tier 3 | `keep` | 빌드 실패 복구 루프 역할이 명확하다. |
| `code-simplifier` | Tier 3 | `keep` | 로컬 simplification 패스로 복원되어 구현 워크플로우에 다시 연결됐다. |
| `codex-review-code` | Tier 3 | `keep` | 결정적 게이트로 대체 불가능한 의미적 코드 리뷰 계층. |
| `codex-validate-plan` | Tier 3 | `keep` | 독립된 계획 검증 단계로 가치가 있다. |
| `commit-moonshot` | Tier 3 | `keep` | 프로젝트 메모리 현행화와 커밋을 위한 공개 유틸리티 진입점. |
| `completion-verifier` | Tier 3 | `keep` | 계약 기반 완료 검증의 핵심 게이트. |
| `context-readiness-gate` | Tier 3 | `keep` | 명시적 readiness gate로 유효하다. |
| `design-approval-gate` | Tier 3 | `improve` | 실제 승인 흐름이 있으면 유지, 없으면 계약을 좁혀야 한다. |
| `design-asset-parser` | Tier 3 | `keep` | 입력/출력이 분명한 전처리 유틸리티. |
| `doc-auto-sync` | Tier 3 | `merge_candidate` | 단일 doc-ops 번들로 수렴 후보. |
| `efficiency-tracker` | Tier 3 | `retire_candidate` | 실제 의사결정에 쓰이지 않으면 아키텍처 가치가 낮다. |
| `failure-analyzer` | Tier 3 | `improve` | 빌드/QA 실패 루프와의 관계를 분명히 해야 한다. |
| `frontend-design` | Tier 3 | `keep` | UI 작업용 내부 공개 스킬로 유지 가치가 높다. |
| `implementation-runner` | Tier 3 | `keep` | 핵심 실행 마이크로스킬. |
| `karpathy-execution-gate` | Tier 3 | `improve` | 철학이 아니라 구체 게이트로 남을 때만 의미가 있다. |
| `moonshot-classify-task` | Tier 3 | `merge_candidate` | 오케스트레이터 분석 번들 뒤로 숨기는 편이 맞다. |
| `moonshot-decide-sequence` | Tier 3 | `merge_candidate` | sequence 결정은 오케스트레이터 경계 뒤로 들어가야 한다. |
| `moonshot-detect-uncertainty` | Tier 3 | `merge_candidate` | planning/readiness 조합 뒤로 숨길 후보. |
| `moonshot-evaluate-complexity` | Tier 3 | `merge_candidate` | 위와 동일. 공개 표면을 넓힐 필요가 없다. |
| `normalize` | Tier 3 | `merge_candidate` | UI/문서 polish 흐름으로 흡수 후보. |
| `polish` | Tier 3 | `merge_candidate` | UI/문서 polish 흐름으로 흡수 후보. |
| `pre-flight-check` | Tier 3 | `keep` | 수정 전 안전 게이트로 명확하다. |
| `product-gate-reviewer` | Tier 3 | `keep` | 제품 정의 게이트 계약이 분명하다. |
| `project-contract-gate` | Tier 3 | `keep` | downstream readiness에 중요하다. |
| `project-md-refresh` | Tier 3 | `improve` | 유용한 유틸리티지만 메인 런타임 경로와는 분리돼야 한다. |
| `qa-flow` | Tier 3 | `merge_candidate` | verification/review 흐름과 겹치므로 조합 계층으로 숨겨야 한다. |
| `security-reviewer` | Tier 3 | `keep` | 독립 보안 관점은 유지 가치가 높다. |
| `session-logger` | Tier 3 | `keep` | doc-ops helper이면서 직접 호출 가능한 공개 유틸리티로 유지한다. |
| `task-slicer` | Tier 3 | `keep` | product -> execution 브리지 역할이 강하다. |
| `test-driven-development` | Tier 3 | `keep` | 동작 변경 작업의 TDD-first evidence를 담당하는 내부 Execute-stage owner. |
| `teach-impeccable` | Tier 3 | `merge_candidate` | frontend/design guidance 스택으로 흡수 후보. |
| `vercel-react-best-practices` | Tier 3 | `keep` | 스택 특화 룰 팩으로 가치가 분명하다. |
| `verification-contract-gate` | Tier 3 | `keep` | 강한 정책 경계. |
| `verification-evidence-gate` | Tier 3 | `keep` | strict 모드의 핵심 정책 경계. |
| `web-design-guidelines` | Tier 3 | `improve` | UI 스택 아래 참고 계층으로 정렬해야 한다. |
| `workflow-self-improver` | Tier 3 | `retire_candidate` | 측정 가능한 개선을 만들지 못하면 유지 가치가 낮다. |
| `workspace-isolation-gate` | Tier 3 | `keep` | 실행 안전 경계로 중요하다. |

## 에이전트

| 자산 | Tier | 결정 | 메모 |
|---|---|---|---|
| `context-builder` | Tier 3 | `keep` | 집중된 컨텍스트 조립 워커로 여전히 유효하다. |
| `design-spec-extractor` | Tier 3 | `improve` | `design-asset-parser`와의 관계를 더 분명히 해야 한다. |
| `documentation-agent` | Tier 3 | `merge_candidate` | session/doc sync 계열과 doc-ops 조합으로 수렴 후보. |
| `phase-attempt-agent` | Tier 2 | `keep` | phase 실행의 핵심 격리 워커. |
| `project-memory-agent` | Tier 3 | `keep` | repo 고유 자산으로 유지 가치가 높다. |
| `project-memory-check` | Tier 3 | `keep` | 실행 전 경계 점검 역할이 명확하다. |
| `project-memory-reviewer` | Tier 3 | `keep` | 변경 후 규칙/스펙 준수 관점으로 유효하다. |
| `requirements-analyzer` | Tier 3 | `keep` | 초기 계획 워커로 강하다. |
| `team-leader-agent` | Tier 2 | `keep` | 팀 조정 경계로 필요하다. |
| `verification-agent` | Tier 3 | `merge_candidate` | completion/QA verification 조합 뒤로 숨길 후보. |

## 확인된 드리프트

- 공개 진입점 정책은 이제 `skill-composition.md`, `README.md`, `.claude/README.md`, `.claude/README.ko.md`에 반영되어 있다.
- 문서/검증 보조 계층은 여전히 여러 스킬과 에이전트로 분산돼 있지만, standalone workflow entrypoint가 아니라 stage bundle 뒤에 배치한다.
- deprecated 자산은 호환성/이력 보존을 위해 `.claude/skills-archive/deprecated/` 아래로 archive되며, `efficiency-tracker`와 `workflow-self-improver`는 기본 flow와 Codex skill link에서 제외한다.

## 공개 표면 상태 모델

이번 다이어트 pass는 아래 public-surface status를 사용한다.

| 상태 | 사용 의도 |
|---|---|
| `public_entrypoint` | 사용자가 workflow 시작점으로 선택할 수 있음 |
| `public_utility` | 좁은 목적의 직접 호출 유틸리티 |
| `internal_stage_owner` | stage 또는 orchestrator 소유, 사용자 진입점 아님 |
| `optional_bundle_member` | task profile이 bundle을 필요로 할 때만 로드 |
| `deprecated` | 호환성/이력 용도로만 유지, 기본 flow에서 제외 |

현재 배치:

| 상태 | 자산 |
|---|---|
| `public_entrypoint` | `product-orchestrator`, `moonshot-phase-runner`, `moonshot-orchestrator` |
| `public_utility` | `session-logger`, `commit-moonshot` |
| `internal_stage_owner` | `moonshot-phase-executor`, `moonshot-in-session-coordinator`, 분석 마이크로스킬, readiness gate, `test-driven-development`, 실행 helper, review/verification gate |
| `optional_bundle_member` | `doc-auto-sync`, `browser-verifier`, `qa-flow`, `web-design-guidelines`, `normalize`, `polish`, `teach-impeccable`, 일부 UI/browser/doc helper |
| `deprecated` | `efficiency-tracker` (archived), `workflow-self-improver` (archived) |

## Invocation Policy 초안

사용 규칙:
- 아이디어 -> 계획 작업은 `product-orchestrator`
- 대형, multi-phase, long-running 작업은 `moonshot-phase-runner`
- phase harness가 필요 없는 bounded implementation은 `moonshot-orchestrator`

사용자가 직접 호출하지 않도록 할 대상:
- 분석 마이크로스킬
- 대부분의 gate
- phase executor
- 대부분의 문서 운영 보조 스킬
  - 단, `session-logger` 같은 공개 유틸리티는 예외

## 결정 요약

개수:
- `keep`: 32
- `improve`: 9
- `merge_candidate`: 9
- `retire_candidate`: 2

구현 전 결론:
- 현재 repo는 보존할 구조가 충분하다
- 우선순위는 entrypoint 강화와 composition 정리다
- 첫 구현 패스는 동작 변경보다 metadata, documentation, bundle 정합화에 집중해야 한다

## 2026-04-24 다이어트 Pass 메모

이번 pass에서는 skill 삭제, 파일 rename, runtime dispatch 재작성은 하지 않았다.

수행:
- targeted internal/optional/deprecated skill에 `surfaceStatus` metadata 추가
- 분석 마이크로스킬은 orchestrator-internal임을 명확화
- `moonshot-in-session-coordinator`를 기본 공개 경로가 아니라 advanced fallback으로 낮춤
- UI/design, doc-ops, browser, guided QA helper를 optional bundle member로 배치
- deprecated asset은 명시적 리포팅, 이력 분석, 유지보수 검토 용도로만 유지

보류:
- deprecated skill installer filtering
- 공개 표면 drift에 대한 verification-contract 자동 enforcement
- deprecated skill directory의 물리적 archive/removal

## 2026-04-24 Wave 2 메모

Wave 2는 runtime core를 교체하지 않고 약한 운영 절차를 보강했다.

수행:
- 로컬 `test-driven-development` skill을 내부 Execute-stage owner로 추가
- sprint, task, QA template에 TDD evidence 필드 추가
- `failure-analyzer`와 `build-error-resolver`에 root-cause-first debugging rule 추가
- `workspace-isolation-gate`에 구체적인 prepare/baseline evidence 요구사항 추가
- plan validation과 plan template에 exact files, commands, fail/pass signals, blockers, review checkpoints, evidence paths 요구사항 추가
- scorecard template과 renderer에 task-level `FULL / PARTIAL / NO` 상태 어휘 추가
- `external-harness-adoption` pilot registry와 review template 추가

계속 보류:
- 외부 benchmark runtime 통합
- 외부 skill production 설치

## 2026-04-24 Wave 3 메모

Wave 3는 agent 설정 디렉터리를 ignore하는 downstream 저장소를 위해 project-local worktree prepare runtime을 추가했다.

수행:
- `git worktree add`와 선택적 agent-config hydration을 수행하는 `harness-prepare-worktree` 스크립트 추가
- `.claude`, `.agents`, `.codex`를 downstream에서 ignore될 수 있는 overlay 경로로 취급
- allowlist `.claude` 하네스 자산만 복사하고 logs, cache, memory, auth, runtime verdict state는 제외
- `workspace-isolation-gate`와 sprint evidence를 `.claude/worktree-prepare.json`에 연결

계속 보류:
- 외부 benchmark runtime 통합
- 외부 skill production 설치
- deprecated skill directory archive/removal
