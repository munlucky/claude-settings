---
name: commit-moonshot
description: Analyze changes, update project memory, and commit
triggers:
  - "commit"
  - "git commit"
---

# Project Memory Update & Commit

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

## 8. Create Commit

```bash
git add [files] .claude/memory.json
git commit -m "[concise commit message]"
```

> **📌 Important: Always include `.claude/memory.json` in the commit.** This file stores Memory MCP update content.

**Commit message rules:**
- No emoji or special characters
- Concise and clear
- Focus on change purpose

---

User context: $ARGUMENTS
