# Phase 03 Permission Review

Status: complete

## Scope

This review covers whether the pinned upstream Ponytail executable surfaces should become Moonshot Relay managed package/runtime assets.

- source pin: `docs/implementation/ponytail-harness-adoption-2026-06-24/source-intake/source-pin.json`
- selected branch: `instruction_tier_only`
- managed adoption verdict: rejected

## Reviewed Executable Surfaces

| Surface | Executable Path | Arguments | Env Vars | Network Use | Filesystem Writes | Process Lifetime | Timeout/Failure Behavior | Package-Policy Representation | Verdict |
|---|---|---|---|---|---|---|---|---|---|
| Upstream Claude/Codex hook config | `hooks/claude-codex-hooks.json` | Hook-defined | Not adopted | Not adopted | Not adopted | Hook-driven | Not adopted | Not represented in current Moonshot package policy | rejected |
| Upstream activation hook | `hooks/ponytail-activate.js` | Hook-defined | Not adopted | Not adopted | Not adopted | Hook-driven | Not adopted | Not represented in current Moonshot package policy | rejected |
| Upstream mode tracker | `hooks/ponytail-mode-tracker.js` | Hook-defined | Not adopted | Not adopted | Not adopted | Hook-driven | Not adopted | Not represented in current Moonshot package policy | rejected |
| Upstream runtime helper | `hooks/ponytail-runtime.js` | Hook-defined | Not adopted | Not adopted | Not adopted | Hook-driven | Not adopted | Not represented in current Moonshot package policy | rejected |
| Upstream config helper | `hooks/ponytail-config.js` | Hook-defined | Not adopted | Not adopted | Not adopted | Hook-driven | Not adopted | Not represented in current Moonshot package policy | rejected |
| Upstream instruction helper | `hooks/ponytail-instructions.js` | Hook-defined | Not adopted | Not adopted | Not adopted | Hook-driven | Not adopted | Not represented in current Moonshot package policy | rejected |

## Decision

Moonshot Relay will not package, install, copy, or runtime-allowlist Ponytail executable hooks in this adoption. The useful behavior is captured in `docs/public/guidelines/minimal-correct-implementation.md`, which is a source-owned guideline and has no executable permission surface.

This means there is no hook permission model to encode in `skills.lock.json`, `package/runtime-surface.json`, or installer policy for this plan package.

## Residual Risk

Users may still install the upstream Ponytail plugin independently outside Moonshot Relay. That remains user-managed external behavior and is not covered by this package adoption.
