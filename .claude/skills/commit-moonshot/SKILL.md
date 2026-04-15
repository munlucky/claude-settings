---
name: commit-moonshot
description: Update project memory and commit when the user explicitly wants both.
triggers:
  - "commit-moonshot"
  - "moonshot commit"
  - "memory commit"
---

# Project Memory Update & Commit

## Status

Supported public utility entrypoint.
It is not part of the default implementation chain, but it should remain directly invocable when the user explicitly wants memory update plus commit.
Treat it as an explicit Finish-stage utility, not an automatic step.

## Overview
This skill runs in the main session, analyzes changes, and always refreshes project memory (`[ProjectID]::*`) in the global Memory MCP to the latest state.

> **⚠️ Important: Complete memory update (steps 1-7) before committing (step 8).**

## 1. Analyze Changes
```bash
git status
git diff --cached --stat
git log -3 --oneline
```

## 2. Get Project ID
```bash
# Priority: package.json > directory name > git remote
PROJECT_ID=$(cat package.json 2>/dev/null | jq -r '.name // empty' || basename $(pwd))
```

## 3. Analyze Changed Files
```bash
git diff --cached --name-only
```

Extract from changed files:
- Component names (from paths like `src/components/Button.tsx`)
- Domain areas (from paths like `src/domains/user/`)
- API endpoints (from API-related files)
- Coding patterns (repeated structures)

## 4. Update 3-Tier Boundaries

### Check Existing Boundaries
Search `[PROJECT_ID]::Boundary::*` with `search_nodes`

### If No Boundaries (First Use)
Create default boundaries:
```
create_entities([
  { name: "[PROJECT_ID]::Boundary::AlwaysDo", entityType: "boundary", observations: ["Run lint before commit", "Verify tests pass"] },
  { name: "[PROJECT_ID]::Boundary::AskFirst", entityType: "boundary", observations: ["Add new dependencies", "Change DB schema"] },
  { name: "[PROJECT_ID]::Boundary::NeverDo", entityType: "boundary", observations: ["Commit .env files", "Delete existing tests"] }
])
```

### Add New Boundaries When Discovered
Add to appropriate boundary when found during change analysis:

| Discovery | Target |
|-----------|--------|
| Required commands | `[PROJECT_ID]::Boundary::AlwaysDo` |
| Approval-needed patterns | `[PROJECT_ID]::Boundary::AskFirst` |
| Forbidden patterns | `[PROJECT_ID]::Boundary::NeverDo` |

Example:
```
# When discovering CI-required commands
add_observations("[my-app]::Boundary::AlwaysDo", ["npm run lint required before npm run build"])
```

## 5. Update Domain/Component Memory

### Entity Create/Update Rules

| Change Type | Action |
|-------------|--------|
| New component file | `create_entities` for `[PROJECT_ID]::Component::[Name]` |
| Existing component modified | `add_observations` with change details |
| API endpoint added/changed | Update `[PROJECT_ID]::API::[EndpointName]` |
| Domain logic changed | Update `[PROJECT_ID]::Domain::[DomainName]` |

### Set Relations
When component dependencies discovered:
```
create_relations([{
  from: "[my-app]::Component::Button",
  to: "[my-app]::Component::ThemeContext",
  relationType: "uses"
}])
```

## 6. Update Coding Conventions

Register as `[PROJECT_ID]::Convention::[Name]` when repeated patterns found:
- Naming rules (e.g., components use PascalCase)
- File structure patterns (e.g., feature-based structure)
- Error handling patterns (e.g., try-catch with logging)
- API response format (e.g., { success, data, error })

## 7. Output Update Summary
After update completion, summarize changes:
```markdown
### Project Memory Update Complete

**Project**: {PROJECT_ID}

**Created entities:**
- [proj]::Component::NewComponent

**Updated entities:**
- [proj]::Component::Button (new prop added)

**New relations:**
- Button → ThemeContext (uses)

**Boundary updates:**
- AlwaysDo: +1 item
```

- AlwaysDo: +1 item

## 7.5 Ensure Docs Staged
Ensure all documentation files (including auto-generated ones) are staged:
```bash
git add CHANGELOG.md README.md .claude/PROJECT.md docs/generated/*
```

## 7.6 Ask About `.claude/memory.json`
Always perform the project memory refresh. The only confirmation needed is whether the refreshed `.claude/memory.json` should be included in this commit.

Suggested prompt:
```text
`.claude/memory.json` was updated during the commit flow. Do you want to include it in this commit?
```

Rules:
- Refresh project memory first regardless of whether `.claude/memory.json` will be committed.
- Do not auto-stage `.claude/memory.json` without user confirmation.
- If the user says yes, stage and commit it with the code/docs changes.
- If the user says no, leave `.claude/memory.json` unstaged and proceed with the rest of the commit.
- Mention the user's choice in the final commit summary.

## 8. Create Commit

```bash
# If user approved including memory:
git add [files] .claude/memory.json

# If user declined:
git add [files]
git commit -m "[concise Korean commit title]" -m $'- 기능: [feature/area] - [key change]\n- 기능: [feature/area] - [key change]\n- 이유: [why this changed]\n- 영향: [user impact or expected effect]'
```

> **📌 Important: `.claude/memory.json` is optional per commit and must follow the user's explicit choice.** This file stores Memory MCP update content.

**Commit message rules:**
- No emoji or special characters
- Always write both the commit title and body in Korean
- Concise and clear
- Focus on change purpose
- Use `one-line title + bullet-list body` as the default format
- Start the body by listing changes grouped by feature area
- If multiple features changed, use one bullet per feature
- Use the format `- 기능: [기능/영역명] - [핵심 변경]` for each feature bullet
- After the feature bullets, add the minimum needed context:
  - `- 이유: [왜 변경했는지]`
  - `- 영향: [사용자 영향, 운영 영향, 기대 효과 중 필요한 내용]`
- Even cross-cutting changes should be grouped under the closest feature or area

**Final user-facing summary rules:**
- Always write the pre/post-commit change summary in Korean
- Use the same feature-grouped bullet list structure as the commit body
- Prefer feature/domain grouping over raw file lists

---

User context: $ARGUMENTS
