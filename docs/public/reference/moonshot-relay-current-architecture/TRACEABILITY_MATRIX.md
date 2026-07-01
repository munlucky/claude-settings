# Traceability Matrix

| Requirement ID | ASR IDs | QAS IDs | ADR IDs | Spec Delta ID | Task ID | Owner | Evidence Path | Verification Signal |
|---|---|---|---|---|---|---|---|---|
| REQ-001 | ASR-001 | QAS-001 | ADR-0001 | DELTA-001 | TASK-001 | docs-architecture | AGENTS.md | `node scripts/architecture-artifact-validate.mjs --mode brownfield_codebase --path docs/public/reference/moonshot-relay-current-architecture --repo-root . --json` |
| REQ-002 | ASR-001 | QAS-001 | ADR-0002 | DELTA-002 | TASK-002 | package-runtime | package/runtime-surface.json | `npm run test:package` |
| REQ-003 | ASR-003 | QAS-003 | ADR-0003 | DELTA-003 | TASK-003 | runtime-state | scripts/runtime-state.mjs | `npm test` |
| REQ-004 | ASR-002 | QAS-002 | ADR-0001 | DELTA-001 | TASK-004 | architecture-context | scripts/architecture-context-build.mjs | `node scripts/architecture-context-build.mjs --stage plan --mode brownfield_codebase --cwd . --json` |
| REQ-005 | ASR-003 | QAS-003 | ADR-0003 | DELTA-003 | TASK-005 | phase-planning | scripts/prepare-phase-runner-state.mjs | `node scripts/prepare-phase-runner-state.mjs --dry-run --json --plan-dir <plan-dir> --master-plan <master-plan>` |
| REQ-006 | ASR-004 | QAS-004 | ADR-0003 | DELTA-004 | TASK-006 | harness-regression | tools/harness-lab/harness-lab.mjs | `npm run test:lab` or scoped harness-lab config |
