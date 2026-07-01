# Domain Model

## Core Concepts

| Entity | Description | Key Relationships |
|---|---|---|
| Canonical Source | Durable repository assets under root source directories. | Materialized into package payloads and account-root runtime. |
| Runtime Profile | Claude/Codex local exposure layer. | Derived from package templates and runtime-surface allowlist. |
| Shared Runtime Home | Account-root Moonshot Relay runtime home resolved through `MOONSHOT_RELAY_HOME`. | Stores common payload and runtime state outside repository source. |
| Public Runtime Skill | Skill exposed in profile-local Claude/Codex discovery. | Declared in `package/runtime-surface.json`. |
| Internal Skill | Source skill used by orchestrators/stages but not exposed profile-locally by default. | Preserved in shared payload. |
| Plan Package | Source or account-root plan artifacts for phase execution. | Consumed by `prepare-phase-runner-state.mjs` and phase-runner flows. |
| Runtime Event | Evidence record for execution, tool calls, evals, completion, and resume state. | Stored through runtime-state helpers. |
| Architecture Package | Evidence-grounded design package with ASRs, ADRs, C4, traceability, and handoff. | Validated by `architecture-artifact-validate.mjs`. |
| Harness Lab Result | Quantitative candidate/baseline evidence. | Supports promotion and rollback decisions. |

## Boundary Rules

- Source owns contracts, templates, schemas, tests, scripts, tools, skills, agents, rules, and public docs.
- Runtime owns sessions, logs, caches, sqlite state, browser artifacts, traces, verdict JSON, and account-root project state.
- Package output is generated from source and is not a separate source authority.
