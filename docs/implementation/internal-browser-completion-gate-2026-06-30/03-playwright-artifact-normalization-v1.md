# Phase 03 - Playwright Artifact Normalization v1

## Goal

Add deterministic Playwright smoke and integration evidence as the primary UI pass/fail layer, then normalize its artifacts into the Phase 01 result contract.

## Execution Metadata

```yaml
phase: "03"
dependsOn:
  - "01-authority-and-result-contract-v1.md"
  - "02-preview-fixture-runner-v1.md"
surfaceClassification:
  - path: "tools/**"
    classification: source_only
  - path: "scripts/**"
    classification: source_only
  - path: "tests/**"
    classification: source_only
  - path: "docs/public/runtime-control-plane.md"
    classification: source_only
  - path: ".moonshot-relay/browser-artifacts/**"
    classification: data_or_state_migration
ownedPaths:
  - "tools/browser-completion/**"
  - "scripts/verification-plane.mjs"
  - "scripts/lib/verification-plane.mjs"
  - "tests/verification-plane-contract.test.mjs"
  - "tests/workflow-e2e-contract.test.mjs"
  - "docs/public/runtime-control-plane.md"
readOnlyPaths:
  - ".moonshot-relay/harness-lab/**"
generatedEvidenceWritePaths:
  - ".moonshot-relay/browser-artifacts/**"
  - "docs/implementation/internal-browser-completion-gate-2026-06-30/execution/phase-03/**"
writeSetBoundary: "Playwright runner source, tests, and docs. Generated screenshots, traces, videos, console, and network logs remain runtime artifacts."
conflicts:
  - "using agentic browser confirmation to override failed Playwright assertions"
  - "treating flaky pass as clean finish for critical scenarios"
stagedPaths:
  - "tools/browser-completion/**"
  - "scripts/verification-plane.mjs"
  - "scripts/lib/verification-plane.mjs"
  - "tests/verification-plane-contract.test.mjs"
  - "tests/workflow-e2e-contract.test.mjs"
  - "docs/public/runtime-control-plane.md"
  - "docs/implementation/internal-browser-completion-gate-2026-06-30/03-playwright-artifact-normalization-v1.md"
  - "docs/implementation/internal-browser-completion-gate-2026-06-30/execution/phase-03/**"
adoptionTargets:
  - "source checkout only"
liveMutationPolicy: "No live account-root/profile/service mutation; Playwright artifacts are generated evidence under excluded runtime paths."
policySources:
  - "docs/public/runtime-control-plane.md"
  - "docs/public/guidelines/verification-workflow-evidence.md"
  - "schemas/verification.contract.yaml"
requiredEvidence:
  - "Playwright result parser tests"
  - "console/network error fixture tests"
  - "artifact path exclusion tests"
```

## Required Work

- Define smoke versus integration scenario depth:
  - smoke: page opens, expected heading/CTA visible, no critical console or 5xx errors.
  - integration: user flow across UI and API, seeded/mocked fixture state, persisted visible result.
- Store artifacts:
  - screenshot
  - trace
  - video when enabled
  - console log
  - network log
  - Playwright report path
  - stdout/stderr
- Normalize Playwright failure into Phase 01 failure classes without weakening assertions.
- Mark flaky retries separately from clean pass.
- Use `clean_pass`, `flaky_pass`, `failed`, and `setup_gap` outcomes; `flaky_pass` blocks clean finish for critical scenarios.
- Require seeded fixtures, deterministic selectors, fixed time where feasible, and blocked uncontrolled network for deterministic scenarios.
- Ensure generated artifact paths remain excluded from package payloads.

## Implementation Decision

Phase 03 adds Playwright result normalization to the verification plane instead of adding a new Playwright invocation runner. The selected surface is:

```powershell
node scripts/verification-plane.mjs normalize-playwright-result --run-id <runId> --goal-id <goalId> --scenario-id <scenarioId> --scenario-json <json> --result-json <json> --json
```

The normalizer converts deterministic Playwright result JSON into `BROWSER_COMPLETION_RESULT` evidence. It is evidence-only and has no completion authority.

Normalization rules:

- `clean_pass`: required artifacts exist under `.moonshot-relay/browser-artifacts/**`, no critical console errors, no failed/5xx network entries, no assertion failures, and deterministic metadata is present where required.
- `flaky_pass`: Playwright passed after retry; this blocks clean finish for critical scenarios.
- `failed`: console error, failed network response, assertion failure, missing artifact, or invalid artifact path.
- `setup_gap`: setup/runtime/parser gap, including missing deterministic metadata for integration-depth scenarios.

Artifact validation uses resolved path containment under `repoRoot/.moonshot-relay/browser-artifacts`; string prefix checks are not accepted. Diagnostics expose counts and sanitized samples only, and normalized command evidence strips env objects and redacts secret-like tokens in command/stdout/stderr.

Agentic browser confirmation remains a later evidence layer. It cannot override failed Playwright assertions.

## Acceptance Criteria

- Failed console errors and failed network responses can fail the result even when a page renders.
- Missing artifacts fail as `artifact_missing`.
- Critical scenario smoke-only evidence does not become clean finish evidence unless the phase explicitly classifies the task as smoke-sufficient.
- Trace metadata can be recorded through `node scripts/verification-plane.mjs normalize-browser-trace`.

## Gates

```powershell
node --test tests/verification-plane-contract.test.mjs tests/workflow-e2e-contract.test.mjs
npm test
```

## Phase Closeout

Independent review must check that Playwright remains deterministic pass/fail authority and that agentic browser verification is not used to override failed Playwright assertions.

Status: complete

Closeout evidence is under `execution/phase-03/`. Independent reviews checked Playwright authority, artifact root containment, redaction, deterministic metadata, setup-gap normalization, and test coverage.
