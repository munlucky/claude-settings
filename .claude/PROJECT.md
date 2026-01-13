# PROJECT.md

> This document defines project-specific rules and structure. Write this file for each project.

## Project Overview
This section captures basic project information.

- **Service**: [service/product name and short description]
- **Stack**: [main tech stack: frameworks, languages, libraries, etc.]
- **Response Language**: [default response language]

## Core Rules (Required)
List the important rules that must be followed in this project.

Example:
1. **API call rules**: [backend call patterns, proxy usage, etc.]
2. **Error handling pattern**: [error handling approach]
3. **Data transformation rules**: [notes for data processing]
4. **File upload rules**: [file upload considerations]
5. **Logging/activity**: [logging rules]

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

Override the default paths from `CLAUDE.md` if needed. **For git-tracked projects, set `tasksRoot` to a path outside `.claude/`.**

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
| Implementation plan | `{tasksRoot}/{feature-name}/context.md` |
| Specification | `{tasksRoot}/{feature-name}/specification.md` |
| Archives | `{tasksRoot}/{feature-name}/archives/` |
| Session logs | `{tasksRoot}/{feature-name}/session-logs/day-{YYYY-MM-DD}.md` |
| Pending questions | `{tasksRoot}/{feature-name}/pending-questions.md` |

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
