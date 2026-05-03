---
title: Provider-Neutral Model Routing
description: Cross-runtime model, effort, and reasoning control policy for Codex, Claude Code, and future provider adapters
lastReviewed: 2026-05-03
---

# Provider-Neutral Model Routing

Moonshot runners select models automatically from `stage`, risk signals, and runtime provider. Users do not choose parallel worker model counts or per-stage model names during normal execution.

## Public Contract

- Keep `modelEffortProfile: economy | standard | deep | max` as the stable public profile.
- Record `selectedModelProvider`, `selectedModel`, `selectedModelEffort`, and `modelSelectionReason` in SPRINT/QA/HANDOFF/workflow evidence.
- `deep` and `max` still require a concrete `Effort escalation reason`.
- `MOONSHOT_MODEL_ROUTING=off` is the emergency disable switch.
- `MOONSHOT_FORCE_MODEL=<provider:model>` is the emergency override and must still be recorded in evidence.

## Default Routing

- `economy`: scan, docs-only, status parsing, closeout gate.
- `standard`: normal phase implementation and parallel workers.
- `deep`: review, security, permission, worktree, runtime adapter, state machine, merge conflict, ambiguous dependency, repeated failure.
- `max`: exceptional blocker analysis only; do not use as the default implementation path.

## Runtime Mapping

- Codex/OpenAI receives `-m <model>` plus `model_reasoning_effort`.
- Claude Code receives `--model <alias>` plus `--effort`.
- Gemini and other providers use the same route object through provider adapter capability keys; unsupported providers must not be selected for execution until an adapter exists.

Model names live in `.claude/config/model-routing.yaml` so current provider recommendations can be updated without changing runner code.
