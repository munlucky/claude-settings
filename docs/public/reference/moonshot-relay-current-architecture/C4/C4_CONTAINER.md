# C4 Container

## Containers

| Container | Primary Paths | Responsibility | Requirement / ASR Links |
|---|---|---|---|
| Source contract docs | `AGENTS.md`, `README.md`, `docs/public/**` | Define contributor, package, runtime, and workflow boundaries. | REQ-001, ASR-001 |
| Skill and agent source | `skills/**`, `agents/**`, `rules/**` | Provide workflow entrypoints and stage owners. | REQ-002, ASR-001 |
| Package and installer source | `package/**`, `bin/**`, `scripts/install-*.mjs` | Build and install shared runtime payload and profile-local exposure. | REQ-001, REQ-002 |
| Runtime state control plane | `scripts/runtime-state.mjs`, `scripts/lib/runtime-state-*.mjs`, `scripts/prepare-phase-runner-state.mjs` | Record leases, events, resume snapshots, and completion decisions. | REQ-003, REQ-005, ASR-003 |
| Architecture design support | `scripts/architecture-*.mjs`, `schemas/architecture/**`, `templates/architecture/**`, `skills/moonshot-architecture/**` | Build context, validate artifacts, bind contracts, and hand off packages. | REQ-004, ASR-002 |
| Verification and lab tooling | `tests/**`, `tools/evals/**`, `tools/harness-lab/**`, `scripts/verification-plane.mjs` | Validate source contracts and quantitative harness behavior. | REQ-006, ASR-004 |
