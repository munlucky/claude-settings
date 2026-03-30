# PROJECT.md

> Example downstream project contract.

Last-Reviewed: 2026-03-30

## Project Overview

- **Service**: Example SaaS admin application
- **Stack**: React 18 + TypeScript 5 + Vite 5 + Node.js 20
- **Response Language**: Match the user request

## Core Rules

1. Human approval ends at planning closeout; execution loops continue autonomously unless blocked.
2. New API or workflow behavior must define verification evidence before implementation starts.
3. Keep durable policy in `PROJECT.md`, `docs/guidelines/`, and `.claude/rules/`.

## Testing Rules

- **Test framework**: Vitest + Playwright
- **Commands**:
  - `npm run typecheck`
  - `npm run lint`
  - `npm test`
  - `npm run test:e2e`

## Document Paths

```yaml
documentPaths:
  tasksRoot: "docs/claude-tasks"
  agreementsRoot: "docs/agreements"
  guidelinesRoot: "docs/guidelines"
```
