# 외부 하네스 Pilot Registry

Last-Reviewed: 2026-04-24

Decision 값:
- `adopt`: 지금 로컬 hard rule로 사용
- `adapt`: 전략을 로컬 skill/template/script로 이식
- `reject`: 기본 flow에서 사용하지 않음
- `defer`: 후속 pilot 또는 regression/eval plane 후보로 보류

Sandbox root:

```text
.tmp/external-skill-pilots/skills-sh/
```

Pilot command:

```bash
node .claude/scripts/external-skills-pilot.mjs
node .claude/scripts/external-skills-pilot.mjs --run-install
node .claude/scripts/external-skills-pilot.mjs --run-install --max-install-candidates 2 --install-timeout-ms 20000
```

Result artifacts:

- `.tmp/external-skill-pilots/skills-sh/manifest.json`
- `docs/claude-tasks/external-harness-adoption/pilot-results.md`
- `docs/claude-tasks/external-harness-adoption/pilot-results.ko.md`

## Tier A: 즉시 적극 pilot / 로컬 gap 재검토

| 후보 | Source Type | 결정 | 로컬 대상 | Pilot Status | 메모 |
|---|---|---|---|---|---|
| `jwynia/agent-skills:requirements-analysis` | skill pattern | adapt | `product-orchestrator`, `moonshot-plan-writer`, `task-slicer` | sandbox registered | problem/non-goal/acceptance/constraint coverage 재검토. |
| `jwynia/agent-skills:system-design` | skill pattern | adapt | `product-orchestrator`, `moonshot-plan-writer`, design gates | sandbox registered | walking skeleton, ADR, rollback strategy 재검토. |
| `obra/superpowers:brainstorming` | skill pattern | adapt | `product-orchestrator`, `task-slicer` | sandbox registered | intake/design 보조로만 사용, public entrypoint 아님. |
| `obra/superpowers:writing-plans` | skill pattern | adapt | `moonshot-plan-writer`, `codex-validate-plan`, `SPRINT_CONTRACT` | local pattern implemented; external comparison pending | exact files/commands/signals 요구. |
| `obra/superpowers:using-git-worktrees` | skill pattern | adapt | `workspace-isolation-gate`, `harness-prepare-worktree` | local runtime implemented; external comparison pending | baseline 및 agent-config hydration evidence 요구. |
| `obra/superpowers:executing-plans` | skill pattern | adapt | `codex-validate-plan`, `implementation-runner` | local pattern implemented; external comparison pending | exact execution target 없는 추상 plan reject. |
| `obra/superpowers:requesting-code-review` | skill pattern | adapt | `codex-review-code`, `QA_REPORT` | sandbox registered | review request payload/cadence 비교. |
| `obra/superpowers:receiving-code-review` | skill pattern | adapt | `codex-review-code`, `QA_REPORT` | sandbox registered | accepted/challenged/deferred findings 규율 비교. |
| `obra/superpowers:verification-before-completion` | skill pattern | adopt | `completion-verifier`, `verification-evidence-gate`, completion gate | local pattern implemented; external comparison pending | 완료 전 fresh evidence 필수. |
| `obra/superpowers:finishing-a-development-branch` | skill pattern | adapt | `commit-moonshot`, `session-logger`, `HANDOFF` | sandbox registered | clean finish/retry/resume handoff와 연결. |
| `obra/superpowers:test-driven-development` | skill pattern | adopt | `test-driven-development`, `SPRINT_CONTRACT`, `QA_REPORT` | local pattern implemented; external comparison pending | 동작 변경 작업은 명시적 bypass 없이는 필수. |
| `obra/superpowers:systematic-debugging` | skill pattern | adopt | `failure-analyzer`, `build-error-resolver`, recovery bundle | local pattern implemented; external comparison pending | 수정 전 root-cause evidence 필요. |

## Tier B: 병렬/팀 실행 및 skill 품질

| 후보 | Source Type | 결정 | 로컬 대상 | Pilot Status | 메모 |
|---|---|---|---|---|---|
| `obra/superpowers:subagent-driven-development` | skill pattern | defer | `moonshot-teams-runner`, phase execution profiles | sandbox registered | 기존 teams runner와 비교 후 판단. |
| `obra/superpowers:dispatching-parallel-agents` | skill pattern | defer | `moonshot-teams-runner`, team coordination | sandbox registered | 현재 parallel evidence를 개선할 때만 도입. |
| `obra/superpowers:writing-skills` | skill pattern | defer | skill metadata lint candidate | sandbox registered | future skill authoring rules 후보. |
| `obra/superpowers:using-superpowers` | skill pattern | defer | skill selection discipline candidate | sandbox registered | public surface 확장 없이 meta discipline만 검토. |
| `skills.sh find-skills` | CLI behavior | defer | external discovery workflow | sandbox registered | discovery 용도만, 기본 runtime 아님. |
| `callstackincubator/agent-skills:validate-skills` | skill quality | defer | skill metadata verifier candidate | sandbox registered | source review 뒤 metadata lint 후보. |

## Tier C: 패턴 차용 / 제한 pilot

| 후보 | Source Type | 결정 | 로컬 대상 | Pilot Status | 메모 |
|---|---|---|---|---|---|
| `planning-with-files` | skill pattern | adapt | tasks/progress/findings pattern only | sandbox registered | hooks는 별도 검토 필요. |
| `notedit/happy-skills:feature-dev` | broad skill | defer | feature-dev comparison only | sandbox registered | default path로는 과도, 비교 corpus로 사용. |
| `open-horizon-labs/skills:review` | review pattern | defer | review rubric comparison only | sandbox registered | `codex-review-code`와 비교. |

## Tier D: 기본 경로 reject

| 후보 | Source Type | 결정 | 로컬 대상 | Pilot Status | 메모 |
|---|---|---|---|---|---|
| `skills.sh` 대량 설치 | installer behavior | reject | none | rejected for default flow | 로컬 skill 중복 및 공개 표면 다이어트와 충돌. |
| 검토되지 않은 hook/shell/network skill | security behavior | reject | none | rejected for default flow | allowlist 전 보안 검토 필요. |
| 외부 skill의 직접 public entrypoint화 | surface behavior | reject | none | rejected for default flow | public entrypoint 수는 고정. |

## External Harness / Eval Plane

| 후보 | Source Type | 결정 | 로컬 대상 | Pilot Status | 메모 |
|---|---|---|---|---|---|
| SWE-bench scoring model | harness concept | adapt | `SCORECARD`, `render-scorecard.py`, completion gate | local vocabulary and gate implemented | 개념만 차용, runtime import 없음. |
| Terminal-Bench / Harbor | benchmark harness | defer | external regression plane export | export adapter added | `eval-plane-integration.md` 참고. |
| OpenAI Evals | eval framework | defer | docs/agent-output rubric export | export adapter added | `eval-plane-integration.md` 참고. |
| Inspect AI | eval framework | defer | formal evaluation manifest export | export adapter added | `eval-plane-integration.md` 참고. |

## Pilot Safety Rules

- production `.claude/skills`가 아니라 sandbox/pilot directory를 사용합니다.
- hook/shell/network behavior는 allowlist 전 검토합니다.
- 로컬 계약 변경 전 evidence를 기록합니다.
- checklist 또는 전략만 로컬 asset에 이식하는 방식을 우선합니다.
