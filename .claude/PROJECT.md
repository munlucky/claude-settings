# PROJECT.md

> Project-specific rules and structure template.

Last-Reviewed: 2026-03-27

## Project Overview
This section captures basic project information.

- **Service**: [service/product name and short description]
- **Stack**: [tech stack - see guide below]
- **Response Language**: [default response language]

### Tech Stack Specification Guide

> **Important**: Be specific about versions and core dependencies.

| ❌ Vague | ✅ Specific |
|----------|------------|
| "React project" | "React 18.2 + TypeScript 5.3 + Vite 5.0" |
| "Node.js backend" | "Node.js 20 LTS + Express 4.18 + Prisma 5.0" |
| "Mobile app" | "React Native 0.73 + Expo SDK 50" |

**Required specifications:**
- [ ] Language/runtime version
- [ ] Framework version
- [ ] Build tool
- [ ] Core libraries (state management, routing, ORM, etc.)

## Core Rules (Required)
List the important rules that must be followed in this project.

Example:
1. **API call rules**: [backend call patterns, proxy usage, etc.]
2. **Error handling pattern**: [error handling approach]
3. **Data transformation rules**: [notes for data processing]
4. **File upload rules**: [file upload considerations]
5. **Logging/activity**: [logging rules]

## Testing Rules

> Info agents need to run and write tests correctly.

- **Test framework**: [Jest / Vitest / Agent Browser / Playwright / etc.]
- **Test file location**: [`__tests__/` / `*.test.ts` / `*.spec.ts`]
- **Coverage expectation**: [80%+ / core logic only / etc.]
- **Commands**:
  - All tests: `npm test`
  - Specific file: `npm test -- --testPathPattern="filename"`
  - Coverage: `npm test -- --coverage`

### Test Writing Rules
- [ ] New features require unit tests
- [ ] API endpoints require integration tests
- [ ] Never delete existing tests (NeverDo)

## Git Workflow

> Specify branch naming, commits, and PR rules.

### Branch Naming Convention
```
feature/{feature-name}   # New features
fix/{issue-number}       # Bug fixes
refactor/{target}        # Refactoring
chore/{task}             # Config, dependencies, etc.
```

### Commit Message Format
```
[type]: concise description

Examples:
feat: add batch execution API
fix: resolve date format conversion error
refactor: extract user query logic
```

**Rules:**
- No emojis or special characters
- Consistent language (Korean or English)
- 50 characters or less recommended

### PR Requirements
- [ ] CI must pass
- [ ] At least 1 reviewer (optional)
- [ ] Link related issues

## Directory/Structure
Describe the project folder structure.

```
[project root]/
|-- [main folder1]/
|   |-- [subfolder]/
|   |-- [subfolder]/
|-- [main folder2]/
`-- [main folder3]/
```

### Key Patterns
Describe commonly used file/folder patterns.

```
[feature folder pattern example]
```

## API/Data Communication Patterns
Describe API calls and data communication patterns.

- **API endpoints**: [API routing rules]
- **Helper functions**: [commonly used utilities]
- **Client calls**: [how clients call APIs]

## Type/Domain Patterns
Describe type definitions and domain model management.

- **Type definition location**: [type file locations and naming rules]
- **Domain models**: [Entity, DTO, Request/Response structures]

## Auth/Authorization
Document auth and authorization details.

- **Auth method**: [JWT, session, etc.]
- **Authorization model**: [permission management approach]
- **Middleware**: [auth/authorization middleware locations]

## Document Paths (Override)

Override `CLAUDE.md` defaults if needed. **For git-tracked projects, set `tasksRoot` outside `.claude/`.**

### Configuration (uncomment and modify as needed)

```yaml
# Document path overrides (defaults in CLAUDE.md)
# documentPaths:
#   tasksRoot: "docs/claude-tasks"      # RECOMMENDED for git-tracked projects
#   agreementsRoot: "docs/agreements"
#   guidelinesRoot: "docs/guidelines"
```

### Path Templates

| Document | Path Pattern |
|----------|-------------|
| Agreement | `{agreementsRoot}/{feature-name}-agreement.md` |
| Product intent | `{tasksRoot}/{feature-name}/product/PRODUCT_INTENT.md` |
| Product requirements | `{tasksRoot}/{feature-name}/product/PRD.md` |
| Product behavior model | `{tasksRoot}/{feature-name}/product/SOLUTION.md` |
| Architecture spec | `{tasksRoot}/{feature-name}/product/SPEC.md` |
| Architecture decisions | `{tasksRoot}/{feature-name}/product/ADR/*.md` |
| Execution plan | `{tasksRoot}/{feature-name}/product/PLAN.md` |
| Execution tasks | `{tasksRoot}/{feature-name}/product/tasks/*.md` |
| Assumptions ledger | `{tasksRoot}/{feature-name}/product/ASSUMPTIONS.md` |
| Hard blockers | `{tasksRoot}/{feature-name}/product/BLOCKERS.md` |
| Implementation plan | `{tasksRoot}/{feature-name}/context.md` |
| Specification | `{tasksRoot}/{feature-name}/specification.md` |
| Archives | `{tasksRoot}/{feature-name}/archives/` |
| Session logs | `{tasksRoot}/{feature-name}/session-logs/day-{YYYY-MM-DD}.md` |
| Pending questions | `{tasksRoot}/{feature-name}/pending-questions.md` |
| Traceability artifacts | `{tasksRoot}/{feature-name}/execution/{REQUIREMENTS_TRACEABILITY,SCENARIO_MATRIX,UAT_CHECKLIST}.md` |

### Project Reference Documents

Generate and maintain these project-specific source-of-truth documents in the downstream project workspace:

- `workflow/README.md` — official development process, runtime roles, entry commands, and branch/worktree policy
- `docs/design/README.md` — shared design rules, component/token guidance, and the exception process for new UI types
- `docs/glossary/README.md` — canonical product/domain terms for screens, APIs, features, and architecture concepts
- `docs/daily/README.md` — daily logging rules and the expected structure under `docs/daily/YYYY-MM-DD/`
- `TEST_GUIDE.md` — human-readable testing guide that complements `.claude/verification.contract.yaml`
- `docs/analysis/README.md` — conventions for impact analysis, architecture notes, and deep-dive investigation docs

## Knowledge Repository (Agent-First)

Use this section in a real project.

- Keep top-level `AGENTS.md` short. It should act as a map, not a full policy dump.
- Store durable policy in source-of-truth paths:
  - `PROJECT.md` (project contract)
  - `docs/guidelines/` or `.claude/docs/guidelines/` (operational guides)
  - `.claude/rules/` (enforceable global/local rules)
- Add `Last-Reviewed: YYYY-MM-DD` to core map/contract docs and refresh it during doc maintenance.
- Run `.claude/scripts/knowledge-repo-audit.sh` after structural doc updates.

## Verification/Commands
List the main commands used in the project.

- `[dev server command]`
- `[build command]`
- `[lint command]`
- `[typecheck command]`
- `[test command]`

## Environment Variables
List environment variables used in the project.

```
[ENV_NAME]="[description or example value]"
```

---

**This file is a per-project template. Update each section to match the project.**
