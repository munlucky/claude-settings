---
name: normalize
description: Realign UI work to the repository's design system, tokens, spacing, and established component patterns.
surfaceStatus: optional_bundle_member
license: Apache 2.0. Adapted from pbakaus/impeccable.
metadata:
  author: pbakaus
  source: https://github.com/pbakaus/impeccable
user-invocable: false
argument-hint: "[feature]"
---

# Normalize

## Visibility

This is a focused frontend helper.
Use `frontend-design` as the umbrella entrypoint when overall UI direction is still unsettled.
Treat this as an optional UI/design bundle member, not a default public workflow entrypoint.

Use when the UI has drifted from the design system or when a feature needs to be brought back into the repository's established patterns.

## Preparation

Load `frontend-design` first. Discover the existing design system before changing code:
- tokens and CSS variables
- shared components
- spacing and typography conventions
- motion and interaction patterns

If the system is unclear, ask instead of guessing.

## Execution Rules

- Prefer existing primitives over new one-off components.
- Replace hard-coded values with tokens where possible.
- Align typography, spacing, color, states, and responsive behavior with the house style.
- Preserve accessibility and functionality while normalizing.
- Remove obsolete duplicated styles after migration.

## Do Not

- invent a new design system inside a single feature
- hard-code values that should be tokenized
- trade accessibility for cosmetic consistency
