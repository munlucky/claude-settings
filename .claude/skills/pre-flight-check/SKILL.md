---
name: pre-flight-check
description: Checks essential information and project status before starting a task.
---

# Pre-Flight Check Skill

**Role**: Check essential info and project status before starting work to reduce omissions.

## Inputs
- Feature name/branch name (optional)
- Required doc paths: CLAUDE.md, context.md, etc.

## Checklist
- UI spec version/design assets availability
- API spec availability
- Similar feature references
- git status/branch, build status
- context.md freshness, unresolved items in pending-questions.md

## Output (example)
```markdown
# Pre-flight Check Results

## Required Info
OK UI spec: v3 (YYYY-MM-DD)
OK API spec: draft available
WARN similar feature reference: not found

## Project Status
OK git status: clean
OK branch: feature/{feature-name}
OK build status: success

## Docs
OK CLAUDE.md: latest
WARN context.md: missing (needs creation)

## Recommended Actions
1. [HIGH] Create context.md (ContextBuilder Agent)
2. [MEDIUM] Verify design assets (invoke design-spec-extractor)
```
