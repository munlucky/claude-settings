# Project Knowledge Plane System Prompt QA Report

## Harness Change Ledger
| Change Area | Files | Evidence |
|-------------|-------|----------|
| Identity and storage contract | `.claude/scripts/project-identity.mjs`, `.claude/schemas/project-identity.schema.json`, `.claude/schemas/knowledge-contract.schema.json` | live tests 56/56, account-root snapshot compare unchanged |
| Typed knowledge and prompt builder | `.claude/scripts/knowledge-records.mjs`, `.claude/scripts/knowledge-context-build.mjs`, knowledge schemas | staged tests 55/55, live tests 56/56 |
| Ontology and lifecycle validators | `.claude/scripts/ontology-constraint-validate.mjs`, `.claude/scripts/knowledge-improvement-lifecycle.mjs`, schemas | live tests 56/56, ontology validator ok with info-level not_configured |
| Orchestrator and runner surfaces | selected `.claude/skills/**`, `.claude/agents/**`, `.codex/skills/**`, `.codex/agents/**` | harness propagation parity passed |
| Verification and workflow contracts | `.claude/verification.contract.yaml`, `.claude/workflow.registry.yaml` | phase-runner boundary passed, plan conformance passed |
| Adoption evidence helper | `.claude/scripts/harness-surface-inventory.mjs` | inventory test 4/4, Euclid allowlist gap fixed with rollback backup |
| Canonical root source | `skills/**`, `agents/**`, `scripts/**`, `schemas/**`, `docs/public/project-knowledge-plane.md` | root tests 56/56, root inventory test 4/4, package materialization passed |
| Account-root installation | `scripts/install-account-root-harness.mjs`, `%USERPROFILE%/.codex`, `%USERPROFILE%/.claude` | direct account-root install verification missing=0/mismatch=0; legacy `harness-core` removed after backup |
