---
name: moonshot-orchestrator
description: PM workflow orchestrator. Analyzes user requests and automatically runs the optimal agent chain.
---

# PM Orchestrator

## Role
Runs PM analysis skills in sequence and builds the final agent chain.

## Inputs
Automatically collect:
- `userMessage`: user request
- `gitBranch`: current branch
- `gitStatus`: Git status (clean/dirty)
- `recentCommits`: recent commit list
- `openFiles`: open file list

## Workflow

### 1. Initialize analysisContext
```yaml
schemaVersion: "1.0"
request:
  userMessage: "{userMessage}"
  taskType: unknown
  keywords: []
repo:
  gitBranch: "{gitBranch}"
  gitStatus: "{gitStatus}"
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
estimates:
  estimatedFiles: 0
  estimatedLines: 0
  estimatedTime: unknown
phase: unknown
complexity: unknown
missingInfo: []
decisions:
  recommendedAgents: []
  skillChain: []
  parallelGroups: []
artifacts:
  contextDocPath: .claude/context.md
  verificationScript: .claude/agents/verification/verify-changes.sh
notes: []
```

### 2. Run PM skills sequentially

#### 2.1 Task classification
Run `/moonshot-classify-task` using the Skill tool.
- Merge returned patch into analysisContext
- Example: add `request.taskType`, `request.keywords`, `notes`

#### 2.2 Complexity evaluation
Run `/moonshot-evaluate-complexity` using the Skill tool.
- Merge returned patch into analysisContext
- Example: update `complexity`, `estimates.*`

#### 2.3 Uncertainty detection
Run `/moonshot-detect-uncertainty` using the Skill tool.
- Merge returned patch into analysisContext
- Check `missingInfo` array

#### 2.4 Uncertainty handling
If `missingInfo` is not empty:
1. Create questions using the `AskUserQuestion` tool
   - Convert each item in `missingInfo` into a question
   - Prioritize HIGH items
2. Wait for user answers
3. Apply answers to analysisContext:
   - API answers -> `signals.apiSpecConfirmed = true`
   - Design spec answers -> store design file paths
   - Other answers -> record in `notes`
4. Set `signals.hasPendingQuestions = false`
5. Re-run `/moonshot-detect-uncertainty` if needed

If `missingInfo` is empty, proceed.

#### 2.5 Sequence decision
Run `/moonshot-decide-sequence` using the Skill tool.
- Merge returned patch into analysisContext
- Set `phase`, `decisions.skillChain`, `decisions.parallelGroups`

### 3. Execute the agent chain

Run `decisions.skillChain` in order:

**Allowed steps:**
- `pre-flight-check`: pre-flight skill
- `requirements-analyzer`: requirements analysis agent (Task tool)
- `context-builder`: context-building agent (Task tool)
- `codex-validate-plan`: Codex plan validation skill
- `implementation-runner`: implementation agent (Task tool)
- `codex-review-code`: Codex code review skill
- `codex-test-integration`: Codex integration test skill
- `verify-changes.sh`: verification script (Bash tool)
- `efficiency-tracker`: efficiency tracking skill
- `session-logger`: session logging skill

**Execution rules:**
1. Run steps sequentially
2. Use `Skill` tool for skill steps
3. Use `Task` tool for agent steps (map subagent_type)
4. Use `Bash` tool for scripts
5. If a parallel group exists, parallelize only within that group
6. If an undefined step appears, ask the user and stop

**Agent mapping:**
- `requirements-analyzer` -> `subagent_type: "general-purpose"` + prompt
- `context-builder` -> `subagent_type: "context-builder"`
- `implementation-runner` -> `subagent_type: "implementation-agent"`

### 4. Record results
Save final analysisContext to `.claude/docs/moonshot-analysis.yaml`.

## Output format

### Summary for the user (Markdown)
```markdown
## PM Analysis Result

**Task type**: {taskType}
**Complexity**: {complexity}
**Phase**: {phase}

### Execution chain
1. {step1}
2. {step2}
...

### Estimates
- File count: {estimatedFiles}
- Line count: {estimatedLines}
- Estimated time: {estimatedTime}

{Add questions section if missingInfo exists}
```

## Error handling

1. **Skill execution failure**: record error logs in notes and report to the user
2. **Undefined step**: ask the user for confirmation
3. **Question loop**: limit to 3 rounds, then proceed with defaults

## Contract
- This skill orchestrates other PM skills and does not analyze directly
- All analysis logic is delegated to individual PM skills
- Patch merging is a shallow object merge (no deep merge)
- User questions use the AskUserQuestion tool
