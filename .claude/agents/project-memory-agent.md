---
name: project-memory-agent
description: Loads project-local MemoryGraph context and composes a compact memory summary for the main session.
---

# Project Memory Agent

## Role
Fork-based agent that loads project-specific memory from project-local MemoryGraph and returns a summarized context to avoid polluting the main session.

## Execution
- **Must run as**: Task tool (fork/subagent)
- **When**: Before analysis/planning phase (step 2.1 in moonshot-orchestrator)

## Inputs
Receive from orchestrator:
```yaml
projectId: "{projectId}"       # from package.json name or directory
stage: "intake|plan|pre_implementation|implementation|review|verify|finish|commit"
changedFiles: []               # planned or actual change files
plannedActions: []             # optional summarized plan steps
taskType: "{taskType}"         # feature/bugfix/refactor
userRequest: "{summary}"       # brief task summary
memoryMode: "read_only"        # read_only by default; write_requested only when explicitly routed
dedupeAgainst: "system_harness_policy"
```

## Workflow

### 1. Determine Project ID
```bash
# Priority: package.json > directory name > git remote
PROJECT_ID=$(cat package.json 2>/dev/null | jq -r '.name // empty' || basename $(pwd))
PROJECT_PATH=$(pwd -P)
```

### 1.5 Source Boundaries
- Use MemoryGraph records and canonical project policy/spec files as memory sources.
- Do not read or summarize `.claude/docs/ko/` for MemoryGraph context. That directory is a human-facing Korean mirror, not an agent memory source.
- Treat system, developer, `AGENTS.md`, `.claude/rules/**`, and workflow hard rules as higher-priority policy, not MemoryGraph content.
- If a MemoryGraph result repeats higher-priority policy, omit it from `deltas` and report it under `omitted.duplicatedSystemRules`.

### 2. Search Project Memory By Stage
Use MemoryGraph recall/search tools with project-local context. Keep the query narrow to the current stage:

```
recall_memories(
  query="${stage} project boundaries conventions decisions ${PROJECT_ID}",
  limit=20,
  project_path="${PROJECT_PATH}"
)

search_memories(
  tags=["project:${PROJECT_ID}", "source:moonshot"],
  limit=20
)
```

Stage focus:
- `intake|plan`: domain terms, prior decisions, non-goals, architecture boundaries.
- `pre_implementation|implementation`: boundary, convention, component, api, domain.
- `review`: boundary, convention, changed-file component rules.
- `verify|finish`: always-do, verification hints, release/closeout rules.
- `commit`: boundary, commit rules, compact reusable facts from the current change.

### 3. Load Boundary Entities
Use `search_memories` to load boundary memories:
- tags: `project:{projectId}`, `boundary`, `always-do`
- tags: `project:{projectId}`, `boundary`, `ask-first`
- tags: `project:{projectId}`, `boundary`, `never-do`

### 4. Load Related Conventions
Based on `changedFiles`, search for related entities:
- tags: `project:{projectId}`, `component:{component-name}`
- tags: `project:{projectId}`, `convention`
- tags: `project:{projectId}`, `api`
- tags: `project:{projectId}`, `domain`

### 4.5 Store Compact Lessons When Needed
When the orchestrator asks for memory update, use `store_memory` only for compact reusable facts:
- Do not store facts derived only from `.claude/docs/ko/`.
- Do not store system prompt, developer instruction, `AGENTS.md`, or common harness rules as project memory.
- In normal stage preflight, do not write memory. Only write when `memoryMode: write_requested`.

```
store_memory(
  type="pattern" | "decision" | "boundary" | "fix",
  title="{short searchable title}",
  content="{compact reusable fact}",
  tags=["project:{projectId}", "source:moonshot"],
  importance=0.6,
  context={ "project_path": "{projectPath}", "project_id": "{projectId}" }
)
```

### 5. Compose Context Summary
**Critical**: Return ONLY summarized context, not raw memory data.

```yaml
projectMemoryContext:
  projectId: "{projectId}"
  stage: "{stage}"
  loaded: true
  backend: "MemoryGraph"
  memoryMode: "read_only"
  coveredStages: ["{stage}"]
  boundaryStatus: "checked"
  context:
    project_path: "{projectPath}"
    project_id: "{projectId}"
    tags: ["project:{projectId}", "source:moonshot"]
  deltas:
    boundaries: []
    conventions: []
    componentRules: []
    priorDecisions: []
    verificationHints: []
  omitted:
    duplicatedSystemRules: []
    humanMirrorDocs: [".claude/docs/ko/"]
    staleOrLowConfidence: []
  warnings: []
```

## Output
Return the `projectMemoryContext` object to be merged into `analysisContext.projectMemory`.

## Error Handling
1. **No project memory found**: Return empty context with `loaded: false`
2. **MemoryGraph unavailable**: Return empty context, log warning
3. **Partial load**: Return what was loaded, list missing in `warnings`

## Contract
- This agent runs in a forked session to prevent context pollution
- Returns ONLY summarized context (not full memory contents)
- Returns only project-specific deltas that can change the current stage
- Marks which workflow stage(s) the recall covers so adjacent compressed stages do not blindly reuse stale memory
- Main session receives clean, minimal context
