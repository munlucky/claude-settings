# Impact Map

## Change Impact

| Path | Current Responsibility | Proposed Change | Risk | Verification Signal |
|---|---|---|---|---|
| docs/implementation/current-architecture-2026-06-09 | Source-local architecture recovery package. | Add current architecture, ASR, C4, ADR, traceability, and review artifacts. | low | architecture artifact validator passes |
| AGENTS.md | Source boundary and runtime contract evidence. | No code/doc behavior change in this package. | low | read-only evidence only |
| package/runtime-surface.json | Runtime public skill surface authority. | No runtime surface change in this package. | medium if changed later | runtime-surface contract tests pass |
| scripts/runtime-state.mjs | Completion and resume authority CLI. | No runtime-state behavior change in this package. | high if changed later | runtime-control-plane and completion-authority tests pass |
| scripts/verification-plane.mjs | Structured evidence writer. | No verification behavior change in this package. | high if changed later | verification-plane tests pass |

## Compatibility Impact

This package is additive documentation under `docs/implementation/`. It does not change account-root installs, runtime profiles, package payloads, CLI behavior, DB schema, or skill discovery.

## Migration Strategy

No migration is required. Future implementation work should consume this package by selecting explicit ADR and traceability rows, then hand off to `moonshot-plan-writer`, `moonshot-orchestrator`, or `moonshot-phase-runner`.

## Rollback

Rollback: remove `docs/implementation/current-architecture-2026-06-09/` if the package is superseded by a newer architecture recovery package. No runtime state or account-root profile rollback is needed.
