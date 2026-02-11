---
name: moonshot-orchestrator
description: PM workflow orchestrator. Analyzes user requests and automatically runs the optimal agent chain.
---

# PM Orchestrator

## Role
Runs PM analysis skills in sequence and builds the final agent chain.

## Usage

```bash
/moonshot-orchestrator <user-request>
/moonshot-orchestrator <user-request> --use-teams
/moonshot-orchestrator <user-request> --use-teams=review-team
```

> Available teams: review-team, research-team, verify-team, planning-team, quality-team, analysis-team, fix-team, impl-team, cross-layer-team, debug-team. Details in `moonshot-teams-runner/SKILL.md`.

## Inputs
Automatically collected:
- `userMessage`, `gitBranch`, `gitStatus`, `recentCommits`, `openFiles`

## Context Budget Rule

> **CRITICAL**: Protect main session context from pollution.

1. **No file content inlining**: Record paths only in analysisContext, never paste file contents
2. **Sub-skill results**: Merge only summarized output into notes (max 5 lines per result)
3. **Notes cap**: When notes array exceeds 10 items, archive oldest items
4. **Review results**: Extract key issues only from codex-review-code output
5. **Fork returns**: Accept only structured summaries from fork agents, never raw data

## Workflow

### 1. Initialize analysisContext

```yaml
schemaVersion: "1.0"
request: { userMessage, taskType: unknown, keywords: [] }
repo: { gitBranch, gitStatus, openFiles: [], changedFiles: [] }
signals:
  hasContextMd: false
  hasPendingQuestions: false
  requirementsClear: false
  implementationReady: false
  implementationComplete: false
  hasMockImplementation: false
  apiSpecConfirmed: false
  reactProject: false
  useAgentTeams: false
  testEnvironmentDetected: false
  testFramework: null
  testsWritten: false
estimates: { estimatedFiles: 0, estimatedLines: 0, estimatedTime: unknown }
phase: unknown
complexity: unknown
missingInfo: []
decisions: { recommendedAgents: [], skillChain: [], parallelGroups: [] }
artifacts:
  tasksRoot: "{PROJECT.md:documentPaths.tasksRoot}"
  contextDocPath: "{tasksRoot}/{feature-name}/context.md"
  verificationScript: .claude/agents/verification/verify-changes.sh
tokenBudget: { specSummaryTrigger: 2000, splitTrigger: 5, contextMaxTokens: 8000, warningThreshold: 0.8 }
projectMemory: { projectId: null, boundaryStatus: "not_checked", boundary: { violations: [], needsApproval: [], reminders: [] }, relatedConventions: [], lastChecked: null }
notes: []
```

### 2. Run PM skills sequentially

#### 2.0 Large specification handling
Follow `.claude/docs/guidelines/document-memory-policy.md`:
- `userMessage` > 2000 words → summarize to `specification.md`, archive original
- Independent features > 5 → split into `subtasks/subtask-NN/` with independent `context.md`
- Keep `context.md` under `tokenBudget.contextMaxTokens`

#### 2.0.5 Load Project Memory (Fork)

> Run `project-memory-agent` as **fork subagent** to prevent context pollution.

```
Task tool: project-memory-agent (subagent_type: general-purpose)
Input: { projectId, changedFiles, taskType, userRequest }
Returns: { projectId, loaded, boundaries, relevantRules } → merge into projectMemory
```
- No memory: `boundaryStatus: "not_initialized"`, continue
- MCP unavailable: `boundaryStatus: "not_checked"`, warn and continue

#### 2.1 Task classification
Run `/moonshot-classify-task` → merge patch (taskType, keywords, signals)

#### 2.2 Complexity evaluation
Run `/moonshot-evaluate-complexity` → merge patch (complexity, estimates)

#### 2.3 Uncertainty detection
Run `/moonshot-detect-uncertainty` → merge patch (missingInfo)

#### 2.4 Uncertainty handling
If `missingInfo` not empty:
1. Generate questions via `AskUserQuestion` (priority HIGH first)
2. Merge answers into analysisContext
3. Set `signals.hasPendingQuestions = false`
4. Re-run detection if needed

#### 2.5 Sequence decision
Run `/moonshot-decide-sequence` → merge patch (phase, skillChain, parallelGroups)

#### 2.6 Plan size management
Follow `document-memory-policy.md`: archive at 80% threshold, summarize at 100%.

### 3. Execute the agent chain

Run `decisions.skillChain` in order.

**Allowed steps:**

| Step | Type | Notes |
|------|------|-------|
| `pre-flight-check` | Skill | |
| `project-memory-agent` | Task (fork) | Context isolation |
| `requirements-analyzer` | Task | |
| `context-builder` | Task | |
| `codex-validate-plan` | Skill | |
| `implementation-runner` | Task | |
| `completion-verifier` | Skill (fork) | Test environment auto-detect |
| `codex-review-code` | Skill | |
| `project-memory-reviewer` | Task (fork) | Context isolation |
| `vercel-react-best-practices` | Skill | When reactProject=true |
| `security-reviewer` | Skill | |
| `build-error-resolver` | Skill | |
| `verify-changes.sh` | Bash | |
| `efficiency-tracker` | Skill | |
| `session-logger` | Skill | |
| `moonshot-phase-runner` | Skill | |
| `moonshot-teams-runner` | Skill | |
| `team-leader-agent` | Task (fork) | Teams coordination |
| `commit-moonshot` | Skill | |

**Agent mapping:**

| Agent | subagent_type | Notes |
|-------|---------------|-------|
| `project-memory-agent` | general-purpose | fork, before 2.1 |
| `requirements-analyzer` | general-purpose | |
| `context-builder` | context-builder | |
| `implementation-runner` | implementation-agent | |
| `project-memory-reviewer` | general-purpose | fork, after codex-review-code |
| `team-leader-agent` | general-purpose | fork, --use-teams |

**Execution rules:**
1. Run steps sequentially (parallelize only within `parallelGroups`)
2. Skill → `Skill` tool, Agent → `Task` tool, Script → `Bash` tool
3. Undefined step → ask user and stop
4. All steps must follow `document-memory-policy.md`

**Agent Teams Integration (--use-teams):**
1. Set `signals.useAgentTeams = true`
2. Fork `team-leader-agent` with team config (see `moonshot-teams-runner/SKILL.md` for team details)
3. Merge summarized `teamReport` into `analysisContext.notes`

> [!CAUTION]
> Agent Teams: ~13K tokens (2-member) / ~20K tokens (3-member). Use for critical reviews or complex implementations only.

**Fork-based agents** (`project-memory-agent`, `project-memory-reviewer`, `team-leader-agent`):
- Run in separate context sessions
- Return only summarized results → prevents main session context pollution

### 3.1 Dynamic Skill Injection

| Signal | Trigger | Action |
|--------|---------|--------|
| `buildFailed` | Bash exit code ≠ 0 | Insert `build-error-resolver`, retry (max 2) |
| `securityConcern` | Changed files contain `.env`/`auth`/`token`/`secret` | Add `security-reviewer` after codex-review-code |
| `coverageLow` | completion-verifier: coverage < 80% | Log warning, request additional tests |
| `reactProject` | `.tsx`/`.jsx` files or React keywords | Insert `vercel-react-best-practices` after codex-review-code |

### 3.2 Project Memory Review (Fork)

After `codex-review-code`:
```
Task tool: project-memory-reviewer (subagent_type: general-purpose)
Input: { projectId, changedFiles, projectMemoryContext, diff }
Returns: { status, violations, needsApproval, warnings, reminders }
```
- `status: "failed"` → **HALT**, report violations
- `status: "needs_approval"` → ask user
- `status: "passed"` → proceed

### 3.3 Completion Verification Loop

After `implementation-runner`:
1. Call `completion-verifier`
2. `allPassed: true` → mark `implementationComplete: true`, proceed
3. `allPassed: false` + retryCount < 2 → go back to failed phase, fix code only, retry
4. `allPassed: false` + retryCount ≥ 2 → ask user for intervention

### 4. Record results
Save final analysisContext to `.claude/docs/moonshot-analysis.yaml`.

## Error handling

1. **Skill failure**: record in notes, report to user
2. **Undefined step**: ask user, stop
3. **Question loop**: max 3 rounds, then proceed with defaults
4. **Token limit**: archive and summarize before continuing

## Contract
- Orchestrates only, does not analyze directly
- Patch merging: shallow object merge
- User questions: `AskUserQuestion` tool
- Follow `document-memory-policy.md`
