---
name: project-md-refresh
description: Analyze the current repository and create or refresh the project bootstrap docs (`.claude/PROJECT.md`, `workflow/README.md`, `docs/design/README.md`, `docs/glossary/README.md`, `docs/daily/README.md`, `TEST_GUIDE.md`, `docs/analysis/README.md`) to match the project.
---

# Project Doc Bootstrap Refresh

## Goal
Create or update the project bootstrap doc set with accurate, evidence-based project details.

> This skill is a bootstrap generator, not a gate by itself. Gate logic belongs in `project-contract-gate`.
> This is a maintenance utility, not part of the default implementation chain.

## Workflow
1. Locate the base files.
   - If `.claude/PROJECT.md` exists, use it as the base; preserve custom rules and update facts.
   - If missing, create `.claude/` if needed and copy `assets/PROJECT.template.md` to `.claude/PROJECT.md`.
   - For project reference docs, create missing files from these assets:
     - `assets/WORKFLOW.README.template.md` -> `workflow/README.md`
     - `assets/DESIGN.README.template.md` -> `docs/design/README.md`
     - `assets/GLOSSARY.README.template.md` -> `docs/glossary/README.md`
     - `assets/DAILY.README.template.md` -> `docs/daily/README.md`
     - `assets/TEST_GUIDE.template.md` -> `TEST_GUIDE.md`
     - `assets/ANALYSIS.README.template.md` -> `docs/analysis/README.md`

2. Collect signals from the repository.
   - Read `README.md` and any project docs.
   - Identify the stack from config files: `package.json`, `pyproject.toml`, `go.mod`, `Cargo.toml`, `build.gradle`, `pom.xml`, `Gemfile`, `requirements.txt`, `Makefile`, or `Taskfile`.
   - Extract run/build/test/lint commands from scripts or tooling.
   - Inspect the top-level directory structure and key entrypoints.
   - Locate API routes/controllers and data models (search for `route`, `router`, `controller`, `handler`, `model`, `schema`).
   - Find auth configuration (search for `auth`, `jwt`, `session`, `oauth`).
   - Note environment variable usage (search for `ENV`, `process.env`, `os.environ`, `dotenv`).
   - Identify shared design systems, token files, component libraries, or UI primitives.
   - Identify canonical domain terminology from product docs, route names, navigation labels, and schema names.
   - Identify the real test entrypoints, CI checks, smoke/regression commands, and any manual QA flows.
   - Identify workflow expectations such as branch naming, worktree usage, required scripts, release flow, or PR rules from existing docs or scripts.

3. Update the bootstrap doc set.
   - `.claude/PROJECT.md`
   - Fill the overview (name, stack, primary language).
   - Summarize core rules and conventions.
   - Document directory structure (top-level + key subdirectories).
   - Document API/data patterns, auth, and docs paths.
   - Add concrete commands for dev/build/lint/test/typecheck.
   - `workflow/README.md`
     - Record the official development flow, role split, standard entry scripts/commands, and document priority.
   - `docs/design/README.md`
     - Record shared UI/system rules, component or token conventions, and how to handle new design patterns.
   - `docs/glossary/README.md`
     - Record canonical terms, forbidden synonyms when applicable, and the update rule for new terms.
   - `docs/daily/README.md`
     - Record daily log structure, required files, minimum required events, and escalation/handoff notes.
   - `TEST_GUIDE.md`
     - Record test commands, scope strategy, environments, manual QA rules, and what must run before completion.
   - `docs/analysis/README.md`
     - Record how to structure impact analysis, architecture notes, and investigation writeups.

4. Output.
   - Save the refreshed bootstrap docs.
   - Provide a short summary and list any gaps/questions.
   - Report whether the minimum contract sections are now ready for orchestration:
     - overview
     - commands
     - testing rules
     - structure/patterns
     - git workflow
     - core rules / boundaries
     - project reference docs

## Guardrails
- Do not invent details; base every statement on files found.
- If information is missing, add TODOs or ask for confirmation.
- Keep content concise and project-specific.
- Preserve user-written project docs; extend or refresh them instead of rewriting from scratch when possible.
