---
name: polish
description: Perform a final UI quality pass for spacing, alignment, states, motion, copy, and visual consistency before shipping.
surfaceStatus: optional_bundle_member
license: Apache 2.0. Adapted from pbakaus/impeccable.
metadata:
  author: pbakaus
  source: https://github.com/pbakaus/impeccable
user-invocable: false
argument-hint: "[target]"
---

# Polish

## Visibility

This is a finishing frontend helper.
Use `frontend-design` as the umbrella entrypoint when the task still needs broader UI direction.
Treat this as an optional UI/design bundle member, not a default public workflow entrypoint.

Use at the end of a UI task when the feature is already functionally complete.

## Preparation

Load `frontend-design` first. Confirm:
- the feature is complete enough for finishing work
- the quality bar is clear (`MVP` vs `flagship`)
- any known limitations that should be preserved for now

## Final Pass Checklist

Inspect and tighten:
- alignment and spacing rhythm
- typography hierarchy
- hover, focus, active, disabled, loading, error, and success states
- copy consistency
- mobile and desktop behavior
- contrast and keyboard usability
- motion smoothness and reduced-motion handling
- console noise, dead code, and obvious cleanup

## Guardrails

- Do not start polish before the feature basically works.
- Do not introduce new concepts while polishing.
- Fix systematic issues at the source when possible.
- Re-verify after any visual or interaction change.
