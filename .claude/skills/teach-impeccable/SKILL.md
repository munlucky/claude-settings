---
name: teach-impeccable
description: Gather persistent design context for a project and save it to .impeccable.md so future UI work has real product context.
surfaceStatus: optional_bundle_member
license: Apache 2.0. Adapted from pbakaus/impeccable.
metadata:
  author: pbakaus
  source: https://github.com/pbakaus/impeccable
user-invocable: false
---

# Teach Impeccable

## Visibility

This is a bootstrap helper for durable design context.
Treat `frontend-design` as the day-to-day entrypoint for UI work.
Use this as an optional UI/design bundle member when durable design context is missing.

Run this once per project when UI work needs durable design context.

## Goal

Create or update `.impeccable.md` at the project root with a `## Design Context` section that future design work can reuse.

## Process

### 1. Explore before asking

Inspect what the repo already reveals:
- README and docs
- component library or design system files
- CSS variables, tokens, themes, fonts
- screenshots, brand assets, and copy tone

Summarize what is already clear and what remains unknown.

### 2. Ask only the missing questions

Use the AskUserQuestion tool or a concise direct question to fill the gaps. Focus on:
- audience and usage context
- jobs to be done
- desired tone and brand personality
- references and anti-references
- accessibility or motion constraints

### 3. Write the context

Persist a section like this:

```md
## Design Context

### Users
...

### Brand Personality
...

### Aesthetic Direction
...

### Design Principles
...
```

### 4. Reuse and maintain

- Update the section in place when direction changes.
- Do not create multiple competing context files.
- If the repo already has a stronger source of truth, mirror that instead of inventing a new one.
