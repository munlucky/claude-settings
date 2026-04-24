# 외부 Skills Pilot 결과

생성 시각: 2026-04-24T06:30:08.539Z
Sandbox root: `.tmp/external-skill-pilots/skills-sh`
Install 실행: yes

| Tier | 후보 | 결정 | 설치 결과 | 로컬 반영 대상 |
|---|---|---|---|---|
| A | `jwynia/agent-skills:requirements-analysis` | adapt | network_blocked | product-orchestrator, moonshot-plan-writer, task-slicer |
| A | `jwynia/agent-skills:system-design` | adapt | network_blocked | product-orchestrator, moonshot-plan-writer, design gates |
| A | `obra/superpowers:brainstorming` | adapt | not_run | product-orchestrator, task-slicer |
| A | `obra/superpowers:writing-plans` | adapt | not_run | moonshot-plan-writer, codex-validate-plan, SPRINT_CONTRACT |
| A | `obra/superpowers:using-git-worktrees` | adapt | not_run | workspace-isolation-gate, harness-prepare-worktree |
| A | `obra/superpowers:executing-plans` | adapt | not_run | codex-validate-plan, implementation-runner |
| A | `obra/superpowers:requesting-code-review` | adapt | not_run | codex-review-code, QA_REPORT |
| A | `obra/superpowers:receiving-code-review` | adapt | not_run | codex-review-code, QA_REPORT |
| A | `obra/superpowers:verification-before-completion` | adopt | not_run | completion-verifier, verification-evidence-gate, completion gate |
| A | `obra/superpowers:finishing-a-development-branch` | adapt | not_run | commit-moonshot, session-logger, HANDOFF |
| A | `obra/superpowers:test-driven-development` | adopt | not_run | test-driven-development, SPRINT_CONTRACT, QA_REPORT |
| A | `obra/superpowers:systematic-debugging` | adopt | not_run | failure-analyzer, build-error-resolver, recovery loop |
| B | `obra/superpowers:subagent-driven-development` | defer | not_run | moonshot-teams-runner, phase execution profiles |
| B | `obra/superpowers:dispatching-parallel-agents` | defer | not_run | moonshot-teams-runner, team coordination |
| B | `obra/superpowers:writing-skills` | defer | not_run | skill metadata lint candidate |
| B | `obra/superpowers:using-superpowers` | defer | not_run | skill selection discipline candidate |
| B | `skills.sh CLI:find-skills` | defer | not_run | external discovery workflow |
| B | `callstackincubator/agent-skills:validate-skills` | defer | not_run | skill metadata verifier candidate |
| C | `othmanadi/planning-with-files:planning-with-files` | adapt | not_run | tasks/progress/findings pattern only |
| C | `notedit/happy-skills:feature-dev` | defer | not_run | end-to-end feature-dev comparison only |
| C | `open-horizon-labs/skills:review` | defer | not_run | review rubric comparison only |
| D | `skills.sh:bulk-installation` | reject | not_applicable | none |
| D | `unreviewed external skills:hook-shell-network-behavior` | reject | not_applicable | none |
| D | `external skill source:direct-public-entrypoint-vendoring` | reject | not_applicable | none |

## 보안/운영 원칙

- Production `.claude/skills`에는 외부 skill을 bulk install하지 않는다.
- hook/shell/network 동작이 있는 skill은 보안 검토 전 allowlist에 넣지 않는다.
- `network_blocked`는 실패가 아니라 재현 가능한 pilot evidence로 기록한다.
