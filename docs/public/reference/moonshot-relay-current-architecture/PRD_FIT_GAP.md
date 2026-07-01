# PRD Fit Gap

## Objective

The user requested `moonshot-architecture` and then `모두 진행`. This package interprets that as a Brownfield current-architecture package for the current Moonshot Relay repository, covering mode classification, current architecture recovery, ASR extraction, options, ADRs, C4, spec delta, plan, traceability, and review.

| Requirement ID | Current Fit | Gap | Evidence |
|---|---|---|---|
| REQ-001 | Fit | Source/runtime boundary is documented; current package adds a specific architecture baseline. | `AGENTS.md`, `docs/public/repository-layout.md` |
| REQ-002 | Fit | Public runtime skill allowlist exists; future changes must keep profile-local exposure constrained. | `package/runtime-surface.json`, `package/package-contract.yaml` |
| REQ-003 | Fit | Runtime-state CLI and tests exist; design package must not weaken completion authority. | `scripts/runtime-state.mjs`, `package.json` |
| REQ-004 | Partial fit | Context builder exists and reports advisory degraded project knowledge; package records this status and anchor disposition. | `scripts/architecture-context-build.mjs`, context builder run |
| REQ-005 | Fit | Phase-runner readiness bridge and documented handoff exist; actual implementation plan remains follow-up. | `scripts/prepare-phase-runner-state.mjs`, `docs/public/guidelines/moonshot-architecture.md` |
| REQ-006 | Fit | Harness lab and active test scripts exist; expensive full lab execution is a follow-up gate for code/runtime changes. | `package.json`, `tools/harness-lab/harness-lab.mjs` |
