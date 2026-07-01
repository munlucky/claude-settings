# Spec Delta

## Delta Table

| Delta ID | Requirement IDs | Spec Delta | Current Evidence | Compatibility / Migration / Rollback |
|---|---|---|---|---|
| DELTA-001 | REQ-001, REQ-004 | Establish `docs/public/reference/moonshot-relay-current-architecture` as a source-owned Brownfield architecture baseline for the current checkout. | `AGENTS.md`, `README.md`, `docs/public/repository-layout.md` | Compatibility: docs-only. Migration: none. Rollback: remove package or revert commit. |
| DELTA-002 | REQ-002 | Preserve allowlisted public runtime skill exposure as a hard architecture boundary for future changes. | `package/runtime-surface.json`, `package/package-contract.yaml` | Compatibility: no runtime changes. Migration: future surface changes require package/materialization tests. Rollback: revert manifest/source changes in future implementation. |
| DELTA-003 | REQ-003, REQ-005 | Preserve runtime-state completion authority and route multi-phase harness changes through plan-writer/phase-runner. | `scripts/runtime-state.mjs`, `scripts/prepare-phase-runner-state.mjs` | Compatibility: no behavior changes. Migration: future plans must include runtime-state verification. Rollback: follow phase-runner/runtime-state rollback evidence. |
| DELTA-004 | REQ-006 | Treat quantitative harness lab/eval gates as required verification for runtime-impacting harness changes. | `package.json`, `tools/harness-lab/harness-lab.mjs` | Compatibility: docs-only. Migration: future implementation must run appropriate lab/eval gates. Rollback: compare/promote/rollback policy remains unchanged. |
