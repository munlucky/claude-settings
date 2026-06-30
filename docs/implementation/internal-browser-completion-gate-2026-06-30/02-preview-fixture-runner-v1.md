# Phase 02 - Preview and Fixture Runner v1

## Goal

Model and implement the deterministic runtime setup before browser verification: command discovery, build, preview server startup, readiness probe, fixture seed/mock setup, log capture, timeout, and cleanup.

## Execution Metadata

```yaml
phase: "02"
dependsOn:
  - "01-authority-and-result-contract-v1.md"
surfaceClassification:
  - path: "scripts/**"
    classification: source_only
  - path: "tools/**"
    classification: source_only
  - path: "tests/fixtures/**"
    classification: source_only
  - path: ".moonshot-relay/browser-artifacts/**"
    classification: data_or_state_migration
ownedPaths:
  - "scripts/browser-flow-runner.mjs"
  - "scripts/lib/**browser**"
  - "tools/browser-completion/**"
  - "tests/fixtures/browser-completion/**"
  - "tests/workflow-e2e-contract.test.mjs"
readOnlyPaths:
  - "node_modules/**"
  - "%USERPROFILE%/.codex/**"
  - "%USERPROFILE%/.claude/**"
generatedEvidenceWritePaths:
  - ".moonshot-relay/browser-artifacts/**"
  - ".moonshot-relay/browser-flow-verdict-*"
  - "docs/implementation/internal-browser-completion-gate-2026-06-30/execution/phase-02/**"
writeSetBoundary: "Source runner and deterministic fixtures only. Generated logs and runtime artifacts must be written by tests or runtime commands under excluded artifact roots."
conflicts:
  - "hard-coding target-project npm commands into generic policy"
  - "leaking auth or secrets into fixture or browser artifacts"
stagedPaths:
  - "scripts/browser-flow-runner.mjs"
  - "tools/browser-completion/**"
  - "tests/fixtures/browser-completion/**"
  - "tests/workflow-e2e-contract.test.mjs"
  - "docs/implementation/internal-browser-completion-gate-2026-06-30/02-preview-fixture-runner-v1.md"
  - "docs/implementation/internal-browser-completion-gate-2026-06-30/execution/phase-02/**"
adoptionTargets:
  - "source checkout only"
liveMutationPolicy: "No account-root, profile, deployment, or live service mutation; generated evidence may be written only through named test or verification commands."
policySources:
  - "docs/public/repository-layout.md"
  - "docs/public/guidelines/verification-workflow-evidence.md"
  - "package.json"
requiredEvidence:
  - "runner command-resolution tests"
  - "preview setup-gap negative tests"
  - "cleanup and timeout tests"
```

## Required Work

- Define how a target project supplies:
  - static check commands
  - build command
  - preview command
  - readiness probe URL
  - fixture seed command
  - mock API command
  - cleanup command
- Support Windows/PowerShell path behavior explicitly.
- Record command stdout/stderr and preview logs.
- Mark missing preview command, missing browser backend, unavailable port, and fixture seed failure as distinct failure classes.
- Ensure cleanup runs after success and failure.
- Keep project-specific command defaults out of generic Moonshot Relay policy unless they are explicitly configured.

## Implementation Decision

Phase 02 extends the existing `scripts/browser-flow-runner.mjs` rather than adding a second runner. The selected surface is:

```powershell
node scripts/browser-flow-runner.mjs --flow preview --config <browser-flow-config.json> --browserctl <path> --run-id <id> --verdict-dir <dir>
```

The config is explicit and target-owned. Moonshot Relay does not infer npm build or preview defaults for target projects. Supported configured fields are:

- `staticCommands`
- `buildCommand`
- `fixtureSeedCommand`
- `mockApiCommand`
- `previewCommand`
- `readinessUrl`
- `cleanupCommand`
- `leakCheckCommand`
- `timeoutMs`
- `redactValues`

Command specs can be arrays, strings, or objects. Object specs support `command`, `args`, `cwd`, `shell`, `timeoutMs`, and `env`; array specs run without shell by default. Windows `.cmd` and `.bat` browser backends use shell only where required for direct execution.

The runner verdict remains a generated evidence artifact, not completion authority. It records runner-local `failureClass`, schema-facing `browserCompletionFailureClass`, `setupGapReason`, stdout/stderr, preview/mock logs, cleanup evidence, and redacted paths/URLs/commands. Runner-local setup-gap classes are mapped to the Phase 01 browser completion result enum so later normalization cannot drift.

Deterministic fixtures were added under `tests/fixtures/browser-completion/**` for preview server, mock API, seed success/failure, cleanup success/failure, redaction, readiness timeout, port conflict, malformed preview command, and configured leak-check failure.

## Acceptance Criteria

- The runner can distinguish product failures from setup gaps.
- A preview process leak is detectable in tests or closeout evidence.
- Fixture state is not stored in package payloads.
- Secrets and auth files are never copied into browser evidence artifacts.

## Gates

```powershell
node --test tests/workflow-e2e-contract.test.mjs
npm test
```

## Phase Closeout

Closeout must include one setup-gap fixture and one normal preview lifecycle fixture.

Status: complete

Closeout evidence is under `execution/phase-02/`. The normal preview lifecycle fixture is covered by `browser flow runner executes configured preview lifecycle and records cleanup evidence`; setup-gap fixtures cover missing preview command, readiness timeout, fixture seed failure, missing browser backend, unavailable port, malformed preview command, cleanup failure, and configured leak detection.
