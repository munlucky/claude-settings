# Phase 05 - Tool Registry, Dispatcher, and Lazy Schema v2

## Goal

Reduce tool context tax and wrong-tool behavior through bounded public tool groups and lazy full-schema promotion.

## Execution Metadata

- Dependencies: Phase 02, Phase 04.
- Owned paths: `tools/agent-api/registry.yaml`, `tools/agent-api/dispatch.mjs`, `schemas/tool-registry.schema.json`, `scripts/lib/runtime-state-store.mjs`, `docs/public/guidelines/token-optimization.md`, `tests/tool-sandbox-eval-contract.test.mjs`, `tests/tool-registry-dispatcher-contract.test.mjs`, `tests/fixtures/harness-control-plane/**`.
- Read-only paths: existing skill definitions except docs explicitly owned by this phase.
- Adoption targets: source dispatcher and package payload.
- Live mutation policy: no new public skill and no live profile mutation.
- Required evidence: public group count fixture, schema summary/full/rejected fixture, wrong-tool regression fixture, invalid-schema rejection fixture, package dry-run.
- Conflicts: public skill proliferation, eager full-schema injection, unvalidated tool args, dispatcher bypass.
- Staged paths: registry/dispatcher/schema files, tool tests, harness-control-plane fixtures.
- Closure traceability: registry validation output, tool budget output, wrong-tool regression output.

## Required Work

- Define 10 to 12 public tool groups with stable summaries.
- Add registry schema and dispatcher command/API.
- Record selected and skipped tool groups with selection reason.
- Promote full schemas only for selected tools.
- Validate arguments through schema before tool execution.
- Record `schema_mode` as `summary`, `full`, or `rejected`.
- Add wrong-tool and invalid-schema regression fixtures.

## Acceptance Criteria

- Public tool group count stays within the declared budget.
- Dispatcher records selected/skipped groups and schema mode.
- Invalid schema calls are rejected before execution.
- Tool selection regression fixtures are part of the active eval/test gate.

## Regression Contract

- Public tool group count cannot exceed the declared 10 to 12 group budget.
- Dispatcher records selected and skipped tool groups with reasons.
- Summary schemas are used by default and full schemas are promoted only for selected tools.
- Invalid schema calls are rejected before execution.
- Wrong-tool and invalid-argument fixtures fail the gate.

## Completion Evidence

- `npm test`
- Registry schema validation output
- Dispatcher summary/full/rejected fixture output
- Tool budget and wrong-tool regression fixture output
