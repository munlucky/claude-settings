# Phase 01 - Authority and Result Contract v1

## Goal

Define the internal browser completion gate contract before implementation. This phase chooses the command surface, result schema, failure taxonomy, and authority boundaries.

## Execution Metadata

```yaml
phase: "01"
dependsOn: []
surfaceClassification:
  - path: "schemas/verification.contract.yaml"
    classification: source_only
  - path: "schemas/browser-completion-result.schema.json"
    classification: source_only
  - path: "scripts/verification-plane.mjs"
    classification: source_only
  - path: "scripts/lib/verification-plane.mjs"
    classification: source_only
  - path: "package/package-contract.yaml"
    classification: source_only
  - path: "tests/verification-plane-contract.test.mjs"
    classification: source_only
  - path: "tests/completion-authority-contract.test.mjs"
    classification: source_only
  - path: "tests/receipt-schema-contract.test.mjs"
    classification: source_only
  - path: "tests/runtime-read-model-contract.test.mjs"
    classification: source_only
  - path: "tests/package-materialization.test.mjs"
    classification: source_only
  - path: "docs/public/guidelines/verification-contract.md"
    classification: source_only
  - path: "docs/public/guidelines/verification-workflow-evidence.md"
    classification: source_only
ownedPaths:
  - "schemas/verification.contract.yaml"
  - "schemas/browser-completion-result.schema.json"
  - "scripts/verification-plane.mjs"
  - "scripts/lib/verification-plane.mjs"
  - "package/package-contract.yaml"
  - "tests/verification-plane-contract.test.mjs"
  - "tests/completion-authority-contract.test.mjs"
  - "tests/receipt-schema-contract.test.mjs"
  - "tests/runtime-read-model-contract.test.mjs"
  - "tests/package-materialization.test.mjs"
  - "docs/public/guidelines/verification-contract.md"
  - "docs/public/guidelines/verification-workflow-evidence.md"
readOnlyPaths:
  - ".moonshot-relay/**"
  - ".codex/**"
  - ".claude/**"
  - "%USERPROFILE%/.moonshot-relay/**"
generatedEvidenceWritePaths:
  - "docs/implementation/internal-browser-completion-gate-2026-06-30/execution/phase-01/SCORECARD.md"
  - "docs/implementation/internal-browser-completion-gate-2026-06-30/execution/phase-01/QA_REPORT.md"
  - "docs/implementation/internal-browser-completion-gate-2026-06-30/execution/phase-01/HANDOFF.md"
writeSetBoundary: "Source contracts and tests only. No generated browser artifacts, lab baselines, account-root profiles, or runtime DB mutation."
conflicts:
  - "treating browser result JSON as completion authority"
  - "weakening completionAuthorityRequiredPlanes through task profile overrides"
stagedPaths:
  - "schemas/verification.contract.yaml"
  - "schemas/browser-completion-result.schema.json"
  - "scripts/verification-plane.mjs"
  - "scripts/lib/verification-plane.mjs"
  - "package/package-contract.yaml"
  - "tests/verification-plane-contract.test.mjs"
  - "tests/completion-authority-contract.test.mjs"
  - "tests/receipt-schema-contract.test.mjs"
  - "tests/runtime-read-model-contract.test.mjs"
  - "tests/package-materialization.test.mjs"
  - "docs/public/guidelines/verification-contract.md"
  - "docs/public/guidelines/verification-workflow-evidence.md"
adoptionTargets:
  - "source checkout only"
liveMutationPolicy: "No account-root, profile, runtime DB, lab baseline, or live service mutation in this phase."
policySources:
  - "AGENTS.md"
  - "schemas/verification.contract.yaml"
  - "docs/public/runtime-control-plane.md"
  - "docs/public/guidelines/verification-contract.md"
  - "docs/public/guidelines/verification-workflow-evidence.md"
requiredEvidence:
  - "targeted verification-plane contract tests"
  - "targeted completion-authority negative tests"
  - "independent review of authority wording"
```

## Required Work

- Select the command surface for the gate. `npm run harness:verify` is an intake candidate, not an accepted name until this phase adds policy and tests.
- Define a browser completion result schema with at least:
  - `schemaVersion`
  - `runId`
  - `goalId`
  - `scenarioId`
  - `status`
  - `failedStage`
  - `failureClass`
  - `evidenceDepth`
  - `sourceFingerprint`
  - `commands`
  - `artifacts`
  - `repairPromptPath`
  - `setupGap`
  - `completionAuthority: false`
  - `authoritySource: "evidence_only"`
  - `artifactSha256`
  - `generatedAt`
  - `producerCommand`
  - `staleStatus`
  - `runtimeDecisionRef`
- Reserve failure classes:
  - `static_gate_failed`
  - `build_failed`
  - `preview_start_failed`
  - `fixture_setup_failed`
  - `playwright_assertion_failed`
  - `browser_confirmation_failed`
  - `artifact_missing`
  - `runtime_environment_failed`
  - `setup_gap`
  - `stale_evidence`
- Define when browser/integration evidence is required for a task.
- Add task classification fields: `requiresBrowserEvidence`, `requiresIntegrationEvidence`, `criticalScenario`, and explicit waiver details.
- Make smoke-only evidence a warning or blocker for critical user-visible scenarios.
- Preserve `runtime-state.sqlite` and `assess-completion` as final whole-plan authority.

## Implementation Decision

- Command surface selected for Phase 01: extend existing `node scripts/verification-plane.mjs` with `classify-task`, `browser-result`, `--task-class-json`, and `--browser-result-json`.
- Deferred command names: `npm run harness:verify`, `npm run test:e2e:smoke`, and `npm run harness:browser-verify` remain blockers until later phases choose package script policy.
- Result schema selected: `schemas/browser-completion-result.schema.json`.
- Result path reserved: `.moonshot-relay/browser-artifacts/<runId>/<scenarioId>/browser-completion-result.v1.json`.
- Authority boundary: browser completion result artifacts always use `completionAuthority=false` and `authoritySource=evidence_only`; `scripts/runtime-state.mjs assess-completion` remains the accepted completion authority.

## Acceptance Criteria

- Missing browser evidence cannot produce accepted completion when the task requires browser evidence.
- A passed browser result without unit/package/installer/security/quality planes cannot produce accepted completion.
- `--required-planes-json` remains summary-only and cannot weaken completion authority.
- `result.json` is not named or placed in a way that conflicts with H0 `lab-result.json`.
- Phase 01 adds negative tests before or with implementation.

## Gates

```powershell
node --test tests/verification-plane-contract.test.mjs tests/completion-authority-contract.test.mjs
npm test
```

## Phase Closeout

Closeout requires an independent reviewer to confirm there is no authority inversion between browser artifacts, H0 lab results, and runtime-state completion decisions.

Status: complete

Independent review confirmed the initial authority gaps, parent integration fixed them, and targeted plus full repository gates pass. Phase 02 may proceed from the selected `verification-plane.mjs` command surface and `browser-completion-result.schema.json` contract.
