# Phase 04 - Agentic Browser Confirmation v1

Status: complete

## Goal

Add a final browser confirmation layer after Playwright passes. This layer checks the rendered screen through an agent-usable browser interface and records confirmation evidence.

## Execution Metadata

```yaml
phase: "04"
dependsOn:
  - "01-authority-and-result-contract-v1.md"
  - "03-playwright-artifact-normalization-v1.md"
surfaceClassification:
  - path: "scripts/browser-flow-runner.mjs"
    classification: source_only
  - path: "agents/verification/verify-runtime.sh"
    classification: source_only
  - path: "scripts/verification-plane.mjs"
    classification: source_only
  - path: ".moonshot-relay/browser-artifacts/**"
    classification: data_or_state_migration
ownedPaths:
  - "scripts/browser-flow-runner.mjs"
  - "agents/verification/verify-runtime.sh"
  - "scripts/verification-plane.mjs"
  - "scripts/lib/verification-plane.mjs"
  - "tests/workflow-e2e-contract.test.mjs"
readOnlyPaths:
  - ".moonshot-relay/harness-lab/**"
generatedEvidenceWritePaths:
  - ".moonshot-relay/browser-artifacts/**"
  - ".moonshot-relay/browser-flow-verdict-*"
writeSetBoundary: "Adapter source only. Generated screenshots, snapshots, and verdicts are runtime artifacts."
conflicts:
  - "treating backend fallback as authority"
  - "confirming a screen after failed Playwright assertions"
stagedPaths:
  - "scripts/browser-flow-runner.mjs"
  - "agents/verification/verify-runtime.sh"
  - "scripts/verification-plane.mjs"
  - "scripts/lib/verification-plane.mjs"
  - "tests/workflow-e2e-contract.test.mjs"
adoptionTargets:
  - "source checkout only"
liveMutationPolicy: "No account-root/profile/live service mutation; browser verdicts and screenshots are generated evidence only."
policySources:
  - "docs/public/runtime-control-plane.md"
  - "docs/public/guidelines/verification-workflow-evidence.md"
  - "package.json"
requiredEvidence:
  - "browser flow verdict tests"
  - "setup-gap tests"
  - "trace normalization tests"
```

## Required Work

- Choose the browser-control backend:
  - Agent Browser CLI or Playwright MCP as the final confirmation adapter.
  - Existing `browserctl`/browser-flow runner only as an explicitly recorded legacy/local fallback.
- Record confirmation checks:
  - URL
  - expected text
  - expected role/name affordance
  - accessibility snapshot or equivalent structured page snapshot
  - screenshot path
  - console/network summary if available
- Treat backend unavailable as setup gap unless the task contract declared browser evidence mandatory, in which case completion remains blocked.
- Keep Agent Browser and Playwright MCP as evidence adapters, not completion authorities.

## Acceptance Criteria

- Browser confirmation can pass only after deterministic Playwright verification is passed or a Phase 01 task contract records why Playwright is not required.
- A setup gap writes a verdict and blocks clean finish when browser evidence is required.
- Agentic browser confirmation cannot update expected text, delete assertions, or mark failed Playwright scenarios as passed.

## Implementation Decision

- `scripts/browser-flow-runner.mjs` owns only adapter execution and raw verdict evidence. It supports an optional `agenticConfirmation`/`browserConfirmation` config block after preview readiness, with backend values `agent-browser`, `playwright-mcp`, or explicit local `browserctl` fallback. Unsupported backends, missing commands, adapter timeout, and adapter-reported `setup_gap` produce setup-gap verdicts and keep cleanup execution.
- `scripts/lib/verification-plane.mjs` owns the semantic normalizer through `normalizeBrowserConfirmationResult`. It requires a clean deterministic Playwright result unless the scenario records a Playwright-not-required waiver, rejects adapter authority claims, preserves parent-owned scenario expectations, and maps failed text/role/snapshot/screenshot/console/network checks to browser evidence failures.
- `scripts/verification-plane.mjs normalize-browser-confirmation` is CLI wiring only. Its output remains `BROWSER_COMPLETION_RESULT` with `completionAuthority: false`; final completion still requires `runtime-state assess-completion`.
- Tests cover swappable fake adapter execution, unsupported backend setup gaps, adapter JSON `setup_gap` despite exit code `0`, cleanup preservation, redacted cwd/command/log evidence, expectation overwrite attempts, authority contamination, failed network aliases, and failed/flaky/setup-gap Playwright non-override behavior.

## Gates

```powershell
node --test tests/workflow-e2e-contract.test.mjs tests/verification-plane-contract.test.mjs
npm test
```

## Phase Closeout

Independent review must verify that the chosen browser adapter is swappable and that unsupported backends produce explicit setup-gap evidence.

Round 1 independent review found five blockers: adapter expectation overwrite, adapter authority contamination, `networkSummary.failedCount` ignored, adapter `status:"setup_gap"` with exit `0` passing, and redacted cwd being used for actual process execution while background cwd leaked. All five were accepted, fixed, and covered by tests.
