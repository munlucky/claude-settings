---
name: moonshot-decide-sequence
description: Determines phase and execution chain based on analysisContext (task type, complexity, signals). Use after uncertainty detection.
---

# PM Sequence Decision

## Shared schema (analysisContext.v1)
```yaml
schemaVersion: "1.0"
request:
  userMessage: "..."
  taskType: feature|modification|bugfix|refactor|unknown
  keywords: []
repo:
  gitBranch: "..."
  gitStatus: clean|dirty
  openFiles: []
  changedFiles: []
signals:
  hasContextMd: false
  hasPendingQuestions: false
  requirementsClear: false
  implementationReady: false
  implementationComplete: false
  hasMockImplementation: false
  apiSpecConfirmed: false
  reactProject: false
estimates:
  estimatedFiles: 0
  estimatedLines: 0
  estimatedTime: unknown
phase: planning|implementation|integration|verification|unknown
complexity: simple|medium|complex|unknown
missingInfo: []
fixForward:
  enabled: true
  policy:
    critical: block           # 보안/데이터 무결성 → 머지 차단
    high: fix-forward-task    # 커밋 후 follow-up 태스크 자동 생성
    medium: merge-with-note   # 경고 기록 후 머지 허용
    low: auto-approve         # 자동 승인
  tasks: []                   # codex-review-code에서 생성된 follow-up 태스크
decisions:
  recommendedAgents: []
  skillChain: []
  parallelGroups: []
artifacts:
  contextDocPath: {tasksRoot}/{feature-name}/context.md
  verificationScript: .claude/agents/verification/verify-changes.sh
notes: []
```

## Phase rules
1. hasPendingQuestions == true -> planning
2. implementationComplete == true && (complexity == complex or (apiSpecConfirmed && hasMockImplementation)) -> integration
3. implementationComplete == true -> verification
4. requirementsClear && hasContextMd && implementationReady -> implementation
5. otherwise -> planning

## Chain rules
Include only stages to run **after moonshot-decide-sequence** (do not include moonshot-* skills).

- simple: implementation-runner -> verify-changes.sh
- medium: requirements-analyzer -> project-memory-check -> implementation-runner -> code-simplifier -> completion-verifier -> doc-auto-sync -> codex-review-code -> efficiency-tracker
- complex: pre-flight-check -> requirements-analyzer -> context-builder -> codex-validate-plan -> project-memory-check -> implementation-runner -> code-simplifier -> completion-verifier -> doc-auto-sync -> codex-review-code -> efficiency-tracker -> session-logger

**Refactor-specific rules** (taskType == refactor):
- Always include `build-error-resolver` after `implementation-runner` for automatic build verification
- For complex refactors: implementation-runner executes in phased mode with build checks between phases
- Reference: `.claude/rules/scope-confirmation.md`, `.claude/rules/refactoring-guidelines.md`

**Note**: `project-memory-check` runs after planning and before implementation to verify boundary compliance.

Complex always includes test-based completion verification.

**Testing Integration** (ref: `.claude/rules/testing.md`):
- medium/complex chains include `completion-verifier` after implementation
- Request additional tests if coverage < 80%
- API changes require integration tests

**Security & Build Error Integration**:
- `security-reviewer`: Triggered when security concern detected (auth changes, env file modified, new dependencies)
- `build-error-resolver`: Triggered when `tsc`/`build` fails, inserted before next implementation step

**Fix Forward Post-Review Branching**:
- After `codex-review-code`, check review verdict and apply `fixForward.policy`:
  - `CRITICAL` → **HALT** (do not merge, re-enter implementation)
  - `HIGH` → **MERGE + create fix-forward task** → append to `fixForward.tasks[]`
  - `MEDIUM` → **MERGE + add note** to `notes[]`
  - `LOW` / No issues → **MERGE** normally

## Parallel execution guide
Only run dependency-free steps in parallel. If results affect the next stage, do not parallelize.

**Possible parallel examples**:
- After `/moonshot-classify-task`: `/moonshot-evaluate-complexity` + `/moonshot-detect-uncertainty`
- After implementation: `codex-review-code` + `verify-changes.sh` (re-run verify if review changes)
- Logging: `efficiency-tracker` + `session-logger`

**Not allowed in parallel**:
- `requirements-analyzer` <-> `context-builder` (requirements must precede)
- `codex-validate-plan` <-> `implementation-runner` (plan validation before implementation)

## Output (patch)
```yaml
phase: planning
decisions.skillChain:
  - pre-flight-check
  - requirements-analyzer
  - context-builder
decisions.parallelGroups:
  - - moonshot-evaluate-complexity
    - moonshot-detect-uncertainty
decisions.recommendedAgents:
  - requirements-analyzer
  - context-builder
notes:
  - "phase=planning, chain=complex"
```
