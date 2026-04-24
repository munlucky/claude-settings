# 외부 하네스 Pilot Registry

Last-Reviewed: 2026-04-24

Decision 값:
- `adopt`: 지금 로컬 hard rule로 사용
- `adapt`: 전략을 로컬 skill/template로 이식
- `reject`: 기본 flow에서 사용하지 않음
- `defer`: 후속 pilot 또는 regression-plane 후보로 보류

| 후보 | Source Type | 결정 | 로컬 대상 | Pilot Status | 메모 |
|---|---|---|---|---|---|
| `test-driven-development` | skill pattern | adopt | `test-driven-development`, `SPRINT_CONTRACT`, `QA_REPORT` | local pattern implemented | 동작 변경 작업은 명시적 bypass 없이는 필수. |
| `systematic-debugging` | skill pattern | adopt | `failure-analyzer`, `build-error-resolver`, recovery bundle | local pattern implemented | 수정 전 root-cause evidence 필요, 같은 failure class는 tactic 변경 요구. |
| `using-git-worktrees` | skill pattern | adapt | `workspace-isolation-gate`, `harness-prepare-worktree` | local runtime implemented | concrete baseline evidence 요구, ignored `.claude/.agents/.codex` hydration 지원. |
| `writing-plans` | skill pattern | adapt | `moonshot-plan-writer`, `task-slicer` | local contract strengthened | exact files/commands/signals 요구. |
| `executing-plans` | skill pattern | adapt | `codex-validate-plan`, `implementation-bundle` | local contract strengthened | exact execution target 없는 추상 plan reject. |
| SWE-bench scoring model | harness concept | adapt | `SCORECARD`, `render-scorecard.py` | local vocabulary implemented | `FULL / PARTIAL / NO` 개념만 차용, runtime import 없음. |
| Terminal-Bench / Harbor | benchmark harness | defer | external regression plane | not started | 로컬 task corpus가 쌓인 뒤 후보. |
| OpenAI Evals | eval framework | defer | docs/agent-output evaluation | not started | PR note, runbook, agent output rubric 후보. |
| Inspect AI | eval framework | defer | formal evaluation plane | not started | 내부 scenario 안정화 이후 후보. |
| `skills.sh` 대량 설치 | installer behavior | reject | none | rejected for default flow | 로컬 skill과 중복되고 공개 표면 다이어트와 충돌. |

## Pilot Safety Rules

- production `.claude/skills`가 아니라 sandbox/pilot directory를 사용합니다.
- hook/shell/network behavior는 allowlist 전 검토합니다.
- 로컬 계약 변경 전 evidence를 기록합니다.
- checklist 또는 전략만 로컬 asset에 이식하는 방식을 우선합니다.
