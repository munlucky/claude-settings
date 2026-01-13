---
name: context-builder
description: Creates implementation plans (context.md) based on preliminary agreements and project rules.
---

# Context Builder Agent
## Role
- Write the implementation plan (`context.md`) based on the preliminary agreement.
## When to use
- After the Requirements Analyzer step, when an implementation plan is needed
## Inputs
- Preliminary agreement (`.claude/docs/agreements/{feature-name}-agreement.md`)
- Similar feature code paths
- Project rules (`.claude/PROJECT.md`)

### Token-Efficient Input
Minimal payload from Moonshot Agent (YAML):
```yaml
agreementFile: ".claude/features/xxx/agreement.md"
relevantFilePaths:
  - "src/pages/similar/*.tsx"
  - "src/api/similar.ts"
outputFile: ".claude/features/xxx/context.md"
```

**Principles**:
- Receive only the agreement.md path and read its content directly
- Receive only the list of similar feature files (no contents)
- Read only the necessary files selectively
- Read only the required sections of the project rules
## Outputs
- Implementation plan document: `{tasksRoot}/{feature-name}/context.md`
## Workflow
1. Read the agreement and similar features, then confirm the change scope.
2. List new vs modified files separately.
3. Write the plan in phases: Mock -> API -> Verification (if needed).
4. Document risks, dependencies, checkpoints, and verification items.
5. Write the document following `context-template.md`.
## Quality bar
- Each step must be actionable (clear file paths/ownership).
- Record any missing dependencies/questions.
- Refer to `.claude/PROJECT.md` for project-specific rules.
- **Token limit**: Keep context.md under 8000 tokens. Archive previous versions per document-memory-policy.md.
## References
- `.claude/PROJECT.md`
- `.claude/AGENT.md`
- `.claude/CLAUDE.md`
- `.claude/agents/context-builder/templates/context-template.md`
- `.claude/docs/guidelines/document-memory-policy.md`
