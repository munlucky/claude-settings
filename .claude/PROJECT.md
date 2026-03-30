# PROJECT.md

> This file is a per-project template. Fill it with facts about the installed project.

Last-Reviewed: 2026-03-30

## Project Overview

- **Service**: [service/product name and short description]
- **Stack**: [tech stack - see guide below]
- **Response Language**: [default response language]

## Core Rules

1. Human approval ends at planning closeout; execution loops continue autonomously unless blocked.
2. New API or workflow behavior must define verification evidence before implementation starts.
3. Keep durable policy in `PROJECT.md`, `docs/guidelines/`, and `.claude/rules/`.

## Testing Rules

- **Test framework**: [test command]
- **Commands**:
  - [dev server command]
  - [build command]
  - [lint command]
  - [typecheck command]
  - [test command]

## Directory/Structure

```text
[project root]/
|-- [main folder1]/
|-- [main folder2]/
|-- [main folder3]/
`-- .claude/
```

## API/Data Communication Patterns

- **API endpoints**: [API routing rules]
- **Helper functions**: [commonly used utilities]
- **Contract exchange**: [how clients call APIs]

## Type/Domain Patterns

- **Type definition location**: [type file locations and naming rules]
- **Domain models**: [Entity, DTO, Request/Response structures]

## Auth/Authorization

- **Auth method**: [JWT, session, etc.]
- **Authorization model**: [permission management approach]
- **Sensitive-path policy**: [auth/authorization middleware locations]

## Document Paths

```yaml
documentPaths:
  tasksRoot: ".claude/docs/tasks"
  agreementsRoot: ".claude/docs/agreements"
  guidelinesRoot: ".claude/docs/guidelines"
```

## Environment Variables

```text
[ENV_NAME]
```
