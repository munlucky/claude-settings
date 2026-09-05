---
name: ui-audit
description: Read-only UI quality analysis across accessibility, performance, responsive behavior, theming, and design anti-patterns.
user-invocable: true
---

# UI Audit

## Goal
Conduct comprehensive, read-only UI quality audits covering accessibility (a11y), responsive design, layout performance, and theme consistency.

## Context
- **Command**: `node scripts/kernel/standalone/ui-audit.mjs [--json]`
- **Scope**: Evaluates frontend components and templates against web design heuristics.

## Autonomy & Priorities
- **Read-Only**: Writes audit reports outside the project source tree; never edits source files, git commits, or Kernel run state.
- **Informational**: A UI audit `PASS` is advisory; it never substitutes for a Kernel protected review receipt.

## Definition of Done
- Audit report generated with findings categorized by severity (blocking/warning/info).

## Verification
- Confirm report output is well-formed markdown/JSON with zero critical accessibility defects.
