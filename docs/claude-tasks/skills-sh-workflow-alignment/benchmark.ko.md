# skills.sh 워크플로우 정렬 벤치마크

Last-Reviewed: 2026-04-24

## 목적

`skills.sh`에서 가져올 만한 외부 워크플로우 패턴을 추려서, 현재 로컬 워크플로우 자산에 매핑한다.

## 소스

2026-03-27 기준 검토:

- [skills.sh 홈](https://skills.sh/)
- [obra/superpowers 컬렉션](https://skills.sh/obra/superpowers)
- [writing-plans](https://skills.sh/obra/superpowers/writing-plans)
- [executing-plans](https://skills.sh/obra/superpowers/executing-plans)
- [subagent-driven-development](https://skills.sh/obra/superpowers/subagent-driven-development)
- [dispatching-parallel-agents](https://skills.sh/obra/superpowers/dispatching-parallel-agents)
- [requesting-code-review](https://skills.sh/obra/superpowers/requesting-code-review)
- [verification-before-completion](https://skills.sh/obra/superpowers/verification-before-completion)
- [using-git-worktrees](https://skills.sh/obra/superpowers/using-git-worktrees)
- [finishing-a-development-branch](https://skills.sh/obra/superpowers/finishing-a-development-branch)
- [writing-skills](https://skills.sh/obra/superpowers/writing-skills)

## 추출한 워크플로우 패턴

벤치마크는 반복해서 같은 운영 모델을 강조한다.

1. 먼저 plan을 만들고, 그 plan은 로컬 문맥이 거의 없는 사람도 실행할 수 있어야 한다.
2. 구현 전에 isolation을 준비한다.
3. 애매한 의도가 아니라 명시적인 task를 기준으로 실행한다.
4. review는 마지막 의식이 아니라 실행 중 반복 단계다.
5. 성공/완료 주장은 항상 fresh verification evidence 뒤에 와야 한다.
6. finish 단계는 열린 결말이 아니라 구조화된 branch/handoff 흐름이어야 한다.
7. 올바른 스킬이 제때 로드되도록 skill metadata는 discoverability 중심으로 작성되어야 한다.

## 매핑 매트릭스

| 외부 패턴 | 로컬 대응 자산 | 적합도 | 준비 단계 시사점 |
|---|---|---|---|
| `writing-plans` | `moonshot-plan-writer`, `task-slicer`, `codex-validate-plan` | Partial-strong | 로컬의 phase planning은 강하지만, broader workflow 차원의 zero-context 실행 가이드는 아직 덜 선명하다. |
| `executing-plans` | `moonshot-phase-runner`, `moonshot-phase-executor`, `moonshot-in-session-coordinator` | Partial | 실행 경로는 존재하지만, "먼저 plan critique, blocker면 중단, 그 다음 실행" 규칙을 공개 문서에서 더 분명히 보여줄 필요가 있다. |
| `subagent-driven-development` | `moonshot-teams-runner`, `phase-attempt-agent`, `codex-review-code` | Partial | 고립된 실행은 존재하지만, two-stage review를 명시적 로컬 단계 계약으로 표준화하지는 못했다. |
| `dispatching-parallel-agents` | `moonshot-teams-runner`, `parallel-execution.md` | Partial | 병렬 실행은 가능하지만, "언제 truly independent라서 병렬화해도 되는지"를 더 쉽게 찾고 적용할 수 있어야 한다. |
| `requesting-code-review` | `codex-review-code`, `security-reviewer` | Partial | 리뷰 자산은 강하지만, task/batch/work size별 필수 review cadence가 단일 규칙으로 드러나 있지 않다. |
| `verification-before-completion` | `completion-verifier`, `verification-evidence-gate` | Strong | 이미 로컬 강점이며, 공개 워크플로우 가이드에서 더 분명한 단계로 승격할 가치가 있다. |
| `using-git-worktrees` | `workspace-isolation-gate`, 프로젝트 프로세스 문서 | Weak-partial | isolation이 존재하긴 하지만 guardrail에 가깝고, 구체적인 setup workflow로는 덜 드러난다. |
| `finishing-a-development-branch` | `commit-moonshot`, `doc-auto-sync`, `session-logger` | Weak | 마감 유틸리티는 있지만, 표준 finish stage와 명시적 다음 행동 흐름으로 제시되지는 않는다. |
| `writing-skills` | `rules/skills/skill-definition.md`, 현재 `SKILL.md` 구조 | Partial | frontmatter는 이미 단순하지만, description 품질이 들쭉날쭉하고 언제 사용할지보다 process를 요약하는 경우가 남아 있다. |

## 도입 결정

이 저장소는 production skill을 대량 설치하지 않고 운영 패턴을 흡수한다.

| 외부 패턴 | 결정 | 로컬 적용 |
|---|---|---|
| `writing-plans` | Adapt | `moonshot-plan-writer`, `task-slicer`, `codex-validate-plan`을 통해 zero-context plan 기대치를 강화 |
| `using-git-worktrees` | Adapt | `workspace-isolation-gate`를 통해 Ready / Isolate를 보이는 stage로 승격하되, 이번 pass에서 새 worktree runtime은 추가하지 않음 |
| `executing-plans` | Adapt | implementation bundle에 "plan critique, blocker면 중단, 명시 task 실행" 규칙 반영 |
| `requesting-code-review` | Adapt | `review-bundle`을 통해 review를 반복 stage로 취급하고, 비사소한 작업은 task/batch cadence를 적용 |
| `verification-before-completion` | Adopt | fresh evidence 전 완료 금지를 공개 workflow의 선택 불가 규칙으로 승격 |
| `finishing-a-development-branch` | Adapt | finish를 흩어진 유틸리티가 아니라 `finish-bundle` decision flow로 전환 |
| SWE-bench `FULL / PARTIAL / NO` | Defer conceptually | 현재 scorecard/verdict runtime은 유지하고, 상태 어휘 아이디어만 후속 후보로 둠 |
| Terminal-Bench / OpenAI Evals / Inspect | Defer | day-1 runtime dependency가 아니라 future external regression plane 후보로 둠 |
| `skills.sh` 대량 설치 | Reject for default flow | sandbox/pilot 검토만 허용하고, production `.claude/skills`에는 선택 전략만 로컬 skill에 흡수 |

## 핵심 시사점

### 1. 필요한 업그레이드는 stage visibility다

이 저장소는 필요한 capability를 이미 많이 가지고 있다.
부족한 것은 다음을 한눈에 보여주는 구조다.

- 다음 단계가 무엇인지
- 그 단계를 어떤 스킬이 책임지는지
- medium/complex 작업에서 어떤 단계가 필수인지

### 2. Isolation은 gate가 아니라 stage여야 한다

`skills.sh`는 isolated workspace/worktree 준비를 정상적인 실행 준비 단계로 다룬다.
이 저장소도 안전성 아이디어는 있지만, stage visibility는 아직 약하다.

### 3. Review는 반복 단계여야 한다

외부 패턴의 강점은 단순히 "리뷰를 한다"가 아니다.
"적절한 cadence로, 초점이 맞는 문맥으로 리뷰를 한다"는 점이다.

### 4. Finish 단계도 구조화가 필요하다

이 저장소는 일을 시작하고 검증하는 데 강하다.
반면 성공적으로 검증된 뒤의 표준 end state는 덜 명시적이다.

### 5. Skill metadata 품질도 workflow 품질에 영향을 준다

`writing-skills`의 지적은 유효하다.
description이 process를 요약하면 모델이 본문을 안 읽고 거기서 멈출 수 있다.
따라서 metadata 정리는 cosmetic polish가 아니라 workflow 정리의 일부다.

## 갭 요약

- 공개 문서에 stage-oriented workflow map은 존재하며, 남은 과제는 consistency와 drift control이다.
- isolation은 Ready / Isolate로 승격했지만, 구체적인 worktree setup automation은 보류한다.
- review cadence는 `review-bundle`로 표현되며, 더 엄격한 work-size 정책은 후속으로 추가할 수 있다.
- finish/handoff는 `finish-bundle`로 표현되며, branch automation은 보류한다.
- skill description과 `surfaceStatus` metadata는 cosmetic polish가 아니라 workflow cleanup의 일부다.
