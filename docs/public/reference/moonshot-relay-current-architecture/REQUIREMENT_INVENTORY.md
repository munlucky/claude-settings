# Requirement Inventory

| Requirement ID | Status | Requirement | Source | Verification Signal |
|---|---|---|---|---|
| REQ-001 | accepted | Preserve canonical source boundaries and keep runtime/generated profiles out of durable source changes. | `AGENTS.md`, `docs/public/repository-layout.md` | `node scripts/architecture-artifact-validate.mjs --mode brownfield_codebase --path docs/public/reference/moonshot-relay-current-architecture --repo-root . --json` |
| REQ-002 | accepted | Preserve the public runtime skill surface as an allowlisted profile-local discovery set while keeping internal skills in canonical/shared payload. | `package/runtime-surface.json`, `package/package-contract.yaml` | `npm run test:package` |
| REQ-003 | accepted | Preserve runtime-state completion authority; phase status or markdown artifacts alone must not prove completion. | `scripts/runtime-state.mjs`, `scripts/prepare-phase-runner-state.mjs` | `npm test` |
| REQ-004 | accepted | Keep architecture packages prompt-safe and evidence-grounded, including project knowledge status and anchor disposition. | `scripts/architecture-context-build.mjs`, `AGENTS.md` | `node scripts/architecture-context-build.mjs --stage plan --mode brownfield_codebase --cwd . --json` |
| REQ-005 | accepted | Route harness-level or multi-phase runtime changes through plan-writer/phase-runner with explicit owners and verification signals. | `README.md`, `docs/public/guidelines/moonshot-architecture.md` | `node scripts/prepare-phase-runner-state.mjs --dry-run --json --plan-dir <plan-dir> --master-plan <master-plan>` |
| REQ-006 | accepted | Maintain a quantitative harness regression path for source changes before promotion or closeout claims. | `package.json`, `tools/harness-lab/harness-lab.mjs` | `npm run test:lab` or scoped harness-lab config |
