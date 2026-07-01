# Capability Map

| Capability | Primary Implementation Surface | Verification Surface | Requirement IDs |
|---|---|---|---|
| Runtime installation and bridge | `bin/moonshot-relay.mjs`, `scripts/install-account-root-harness.mjs`, `scripts/install-project-runtime-bridge.mjs` | `npm run test:package`, installer dry-runs | REQ-001, REQ-002 |
| Skill and profile exposure governance | `package/runtime-surface.json`, `package/package-contract.yaml`, `skills/**` | Package materialization and plugin manifest tests | REQ-002 |
| Architecture design support | `skills/moonshot-architecture/**`, `scripts/architecture-*.mjs`, `schemas/architecture/**`, `templates/architecture/**` | `tests/moonshot-architecture-*.test.mjs`, architecture validator | REQ-004 |
| Phase-runner readiness and runtime state | `scripts/prepare-phase-runner-state.mjs`, `scripts/runtime-state.mjs`, `scripts/lib/runtime-state-*.mjs` | Runtime-state, phase-final-guard, completion-authority tests | REQ-003, REQ-005 |
| Verification and lab regression | `package.json`, `scripts/verification-plane.mjs`, `tools/evals/**`, `tools/harness-lab/**` | `npm test`, `npm run test:lab`, eval suites | REQ-006 |
| Public documentation and roadmap source | `docs/public/**`, `docs/public/roadmaps/**`, `docs/public/reference/**` | Markdown/package validation and review evidence | REQ-001, REQ-005 |
