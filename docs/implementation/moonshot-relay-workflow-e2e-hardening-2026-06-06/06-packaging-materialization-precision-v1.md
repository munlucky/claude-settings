# Phase 06 - Packaging Materialization Precision

## Goal

Prevent package payload false passes and silent omission of legitimate future assets.

## Scope

- `package/build-package.mjs`
- `package/package-contract.yaml`
- plugin manifests
- package/materialization tests

## Tasks

1. Replace segment-wide generated-state denylist with path-aware generated root rules where possible.
2. Preserve exclusions for known runtime state roots.
3. Add fixtures proving legitimate `fixtures`, `cache`, or `logs` directories under allowed skill/reference assets are not silently dropped unless explicitly denied.
4. Strengthen dry-run planned output schema and critical entry checks.

## Acceptance

- Runtime state still excluded.
- Legitimate source assets are not excluded solely because of broad segment names.
- Dry-run output becomes a stable contract, not only a count report.
