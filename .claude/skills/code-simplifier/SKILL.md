---
name: code-simplifier
description: Simplifies and refines recently modified code for clarity, consistency, and maintainability while preserving exact functionality.
---

# Code Simplifier

## Role

Run after implementation and before final verification or review when the change set would benefit from a clarity pass.

This skill is workflow-integrated, but it may also be invoked directly for an explicit simplification pass.

## Core Contract

- preserve exact behavior
- work primarily on recently modified code
- prefer clarity over brevity
- reduce unnecessary complexity, nesting, and duplication
- follow repository coding standards and established patterns
- avoid clever rewrites that make debugging harder

## What To Improve

- redundant branches, wrappers, and abstractions
- shallow pass-through modules that fail the deletion test
- overly dense expressions and nested ternaries
- names that obscure intent
- repeated logic that can be consolidated safely
- comments that restate obvious code
- inconsistent structure inside recently touched modules
- module locality when a small interface can hide repeated implementation complexity

## What Not To Do

- do not widen scope beyond recently modified files unless explicitly asked
- do not change external behavior, data contracts, or side effects
- do not compress code into dense one-liners
- do not remove useful abstractions that improve module boundaries
- do not introduce a new abstraction unless it improves locality, leverage, or testability
- do not rename domain terms away from the project glossary without updating the glossary or surfacing the conflict

## Suggested Workflow Position

Typical placement:

1. `implementation-runner`
2. `code-simplifier`
3. `completion-verifier`
4. `codex-review-code`

## Output

- refined code with unchanged behavior
- short note only when a simplification materially changes readability or structure
