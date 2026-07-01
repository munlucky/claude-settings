# C4 Component

## Runtime State and Architecture Design Components

| Component | Container | Responsibility | Evidence | Requirement / ASR Links |
|---|---|---|---|---|
| `architecture-context-build.mjs` | Architecture design support | Builds prompt-safe architecture context from project knowledge metadata. | `scripts/architecture-context-build.mjs` | REQ-004, ASR-002 |
| `architecture-artifact-validate.mjs` | Architecture design support | Validates package file set, ADRs, traceability, Brownfield evidence, path boundaries, and plan readiness. | `scripts/architecture-artifact-validate.mjs` | REQ-004, ASR-002 |
| `runtime-state.mjs` | Runtime state control plane | CLI entrypoint for runtime state events, completion decisions, evals, tool calls, and assessments. | `scripts/runtime-state.mjs` | REQ-003, ASR-003 |
| `prepare-phase-runner-state.mjs` | Runtime state control plane | Resolves plan packages, phase docs, execution root, run identity, and dry-run readiness. | `scripts/prepare-phase-runner-state.mjs` | REQ-005, ASR-003 |
| `harness-lab.mjs` | Verification and lab tooling | Runs package/eval/research fixture suites, compares baselines, promotes and rolls back baseline evidence. | `tools/harness-lab/harness-lab.mjs` | REQ-006, ASR-004 |
| `package/runtime-surface.json` | Package and installer source | Declares public profile-local skill exposure allowlist. | `package/runtime-surface.json` | REQ-002, ASR-001 |
