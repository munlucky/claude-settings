---
name: audit
description: Run a technical UI quality audit across accessibility, performance, responsive behavior, theming, and design anti-patterns.
license: Apache 2.0. Adapted from pbakaus/impeccable.
metadata:
  author: pbakaus
  source: https://github.com/pbakaus/impeccable
user-invocable: true
argument-hint: "[area]"
---

# Audit

Use for review-only UI quality checks. Do not make edits in this skill unless the user explicitly asks for fixes after the report.

## Preparation

Load `frontend-design` first. If no design context exists, run `teach-impeccable` or ask the user for the missing context.

## What To Check

Review the target across five dimensions:
1. accessibility
2. performance
3. theming and token usage
4. responsive behavior
5. AI-slop and design anti-patterns

## Output

Produce:
- a 0-4 score for each dimension
- a total score
- the anti-pattern verdict first
- prioritized findings tagged `P0` to `P3`
- file, component, or surface references where possible
- recommended next steps, usually `normalize` and `polish`

## Quality Bar

- Focus on real user impact, not noisy nitpicks.
- Explain why each issue matters.
- Separate measurable technical defects from subjective taste.
