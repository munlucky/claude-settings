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
changedFiles: []               # planned change files
taskType: "{taskType}"         # feature/bugfix/refactor
userRequest: "{summary}"       # brief task summary
```

## Workflow

### 1. Determine Project ID
```bash
# Priority: package.json > directory name > git remote
PROJECT_ID=$(cat package.json 2>/dev/null | jq -r '.name // empty' || basename $(pwd))
PROJECT_PATH=$(pwd -P)
```

### 2. Search Project Memory
Use MemoryGraph recall/search tools with project-local context:

```
recall_memories(
  query="project boundaries conventions decisions ${PROJECT_ID}",
  limit=20,
  project_path="${PROJECT_PATH}"
)

search_memories(
  tags=["project:${PROJECT_ID}", "source:moonshot"],
  limit=20
)
```

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
  loaded: true
  
  boundaries:
    alwaysDo:
      - "Run lint before commit"
      - "Ensure tests pass"
    askFirst:
      - "Adding new dependencies"
      - "DB schema changes"
    neverDo:
      - "Commit .env files"
      - "Delete existing tests"
  
  relevantRules:
    - entity: "[proj]::Component::Button"
      summary: "variant prop required, onClick handler rules"
    - entity: "[proj]::Convention::API"
      summary: "unified error response format"
  
  warnings: []  # any issues found during loading
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
- Main session receives clean, minimal context
