# PRD Fit Gap

| Requirement ID | Existing Behavior | Fit | Gap |
|---|---|---|---|
| REQ-101 | Root source boundaries are documented in `AGENTS.md`, `README.md`, and `docs/public/repository-layout.md`. | fit | Keep future changes source-first and avoid profile-local drift. |
| REQ-102 | `package/runtime-surface.json` and `package/package-contract.yaml` define profile allowlist and common payload preservation. | fit | Any surface change must update docs, package tests, and installer behavior together. |
| REQ-103 | `docs/public/runtime-control-plane.md` and `scripts/runtime-state.mjs` define DB-backed authority. | fit | Operators must continue to treat phase status and reports as projections only. |
| REQ-104 | `schemas/verification.contract.yaml` and `scripts/verification-plane.mjs` define required planes and evidence writers. | fit | Security/browser/installer evidence remains operationally expensive and must stay explicit. |
| REQ-105 | `rules/workflow-bundles.yaml` defines bundle routing; README documents public entrypoints. | fit | Internal skills must stay out of profile-local discovery unless deliberately promoted. |
| REQ-106 | `docs/public/project-knowledge-plane.md` and memory promotion scripts define lifecycle gates. | partial | Current architecture context builder reported account-root project knowledge records as not configured. |
| REQ-107 | `skills/moonshot-architecture/`, schemas, tests, and validator exist. | fit | Current project-wide architecture package needed to be refreshed from live source evidence. |
