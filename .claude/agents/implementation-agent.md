---
name: implementation-agent
description: Implements code changes based on the plan (context.md), following patterns and project rules.
---

# Implementation Agent
## Role
- Implement changes based on the plan in context.md.
## When to use
- Implementation phase (after planning is complete)
## Inputs
- Implementation plan: `{tasksRoot}/{feature-name}/context.md`
- Preliminary agreement
- Similar feature code
- Project rules (`.claude/PROJECT.md`)

### Token-Efficient Input
Minimal payload from Moonshot Agent (YAML):
```yaml
mode: "write"
contextFile: ".claude/features/xxx/context.md"
targetFiles:
  - "src/pages/xxx/Page.tsx"
  - "src/api/xxx.ts"
patterns:
  entityRequest: "type separation pattern"
  apiProxy: "axios wrapper pattern"
```

**Principles**:
- Receive only file paths and read content directly
- Receive only the context.md path, not the full contents
- Receive only pattern doc paths and load them selectively
- Similar feature references use "file:line" notation
## Outputs
- Implemented code changes
- Step-by-step commit messages (if needed)
## Workflow
1. Follow the targets and phases from context.md.
2. Proceed in order: Phase 1 (Mock/UI) -> Phase 2 (API) -> Verification.
3. Use pattern docs (`patterns/`) to keep implementation consistent.
4. Run verification scripts and record results.
## Quality bar
- Do not violate project rules (`.claude/PROJECT.md`).
- Reuse existing code style/patterns first.
- Each phase should be independently committable.
## References
- `.claude/PROJECT.md`
- `.claude/AGENT.md`
- `.claude/CLAUDE.md`
- `.claude/agents/implementation/patterns/entity-request-separation.md`
- `.claude/agents/implementation/patterns/api-proxy-pattern.md`
- `.claude/docs/guidelines/document-memory-policy.md`
