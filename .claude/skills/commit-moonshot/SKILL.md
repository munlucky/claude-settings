---
name: commit-moonshot
description: Analyze changes, update project memory, and commit
triggers:
  - "commit-moonshot"
  - "moonshot commit"
  - "memory commit"
---

# Project Memory Update & Commit

## Status

Supported public utility entrypoint.
It is not part of the default implementation chain, but it should remain directly invocable when the user explicitly wants memory update plus commit.

## Overview
This skill runs in the main session, analyzes changes, and updates project memory (`[ProjectID]::*`) in the global Memory MCP.

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
Before staging the memory file, ask the user whether to include `.claude/memory.json` in this commit.

Suggested prompt:
```text
`.claude/memory.json` was updated during the commit flow. Do you want to include it in this commit?
```

Rules:
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
git commit -m "[concise Korean commit message]"
```

> **📌 Important: `.claude/memory.json` is optional per commit and must follow the user's explicit choice.** This file stores Memory MCP update content.

**Commit message rules:**
- No emoji or special characters
- Write the commit message in Korean
- Concise and clear
- Focus on change purpose

---

User context: $ARGUMENTS
