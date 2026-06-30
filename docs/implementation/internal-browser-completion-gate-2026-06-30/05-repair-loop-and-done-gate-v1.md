# Phase 05 - Repair Loop and Done Gate v1

Status: complete

## Goal

Connect failed browser/integration evidence to a bounded repair loop and block agent done claims until the latest required evidence is fresh and passing.

## Execution Metadata

```yaml
phase: "05"
dependsOn:
  - "01-authority-and-result-contract-v1.md"
  - "02-preview-fixture-runner-v1.md"
  - "03-playwright-artifact-normalization-v1.md"
  - "04-agentic-browser-confirmation-v1.md"
surfaceClassification:
  - path: "skills/completion-verifier/**"
    classification: source_only
  - path: "skills/qa-flow/**"
    classification: source_only
  - path: "scripts/runtime-state.mjs"
    classification: source_only
  - path: "scripts/verification-plane.mjs"
    classification: source_only
  - path: "scripts/lib/review-bundle.mjs"
    classification: source_only
  - path: "schemas/review-bundle.schema.json"
    classification: source_only
  - path: "schemas/review-finding.schema.json"
    classification: source_only
  - path: "schemas/review-critique-loop.schema.json"
    classification: source_only
  - path: "docs/public/runtime-control-plane.md"
    classification: source_only
  - path: ".moonshot-relay/**"
    classification: data_or_state_migration
ownedPaths:
  - "skills/completion-verifier/**"
  - "skills/qa-flow/**"
  - "scripts/runtime-state.mjs"
  - "scripts/verification-plane.mjs"
  - "scripts/lib/review-bundle.mjs"
  - "scripts/review-bundle-build.mjs"
  - "schemas/review-bundle.schema.json"
  - "schemas/review-finding.schema.json"
  - "schemas/review-critique-loop.schema.json"
  - "tests/completion-authority-contract.test.mjs"
  - "tests/verification-plane-contract.test.mjs"
  - "tests/review-bundle-contract.test.mjs"
  - "tests/review-finding-contract.test.mjs"
  - "docs/public/runtime-control-plane.md"
readOnlyPaths:
  - "%USERPROFILE%/.moonshot-relay/**"
  - "%USERPROFILE%/.codex/**"
  - "%USERPROFILE%/.claude/**"
generatedEvidenceWritePaths:
  - ".moonshot-relay/browser-artifacts/**"
  - ".moonshot-relay/verification-reports/**"
  - ".moonshot-relay/runtime-verdict-*"
writeSetBoundary: "Completion and repair policy source only. Runtime-state DB and repair artifacts are generated evidence, not source."
conflicts:
  - "repair loop deleting or weakening failing assertions"
  - "claiming done from stale or different-source browser evidence"
stagedPaths:
  - "skills/completion-verifier/**"
  - "skills/qa-flow/**"
  - "scripts/runtime-state.mjs"
  - "scripts/verification-plane.mjs"
  - "scripts/lib/review-bundle.mjs"
  - "scripts/review-bundle-build.mjs"
  - "schemas/review-bundle.schema.json"
  - "schemas/review-finding.schema.json"
  - "schemas/review-critique-loop.schema.json"
  - "tests/completion-authority-contract.test.mjs"
  - "tests/verification-plane-contract.test.mjs"
  - "tests/review-bundle-contract.test.mjs"
  - "tests/review-finding-contract.test.mjs"
  - "docs/public/runtime-control-plane.md"
adoptionTargets:
  - "source checkout only"
liveMutationPolicy: "No account-root/profile/live service mutation; runtime DB and repair artifacts are generated evidence written only by named commands."
policySources:
  - "docs/public/runtime-control-plane.md"
  - "docs/public/guidelines/verification-contract.md"
  - "docs/public/guidelines/verification-workflow-evidence.md"
  - "schemas/verification.contract.yaml"
requiredEvidence:
  - "done-gate negative tests"
  - "stale evidence invalidation tests"
  - "repair prompt fixture tests"
  - "two-iteration review-critique-loop receipt tests"
  - "review receipt redaction and finding disposition tests"
```

## Required Work

- Generate `repair-prompt.md` or equivalent from structured failure evidence.
- Include:
  - scenario id
  - failed step
  - failure class
  - console/network summary
  - artifact paths
  - prohibited repair actions
  - rerun command
- Enforce `maxRepairAttempts: 2` by default unless a phase contract explicitly lowers it.
- Rerun the same `scenarioId` after repair and preserve failing assertion ids.
- Mark exhausted loops as `repair_exhausted` with artifact links.
- Invalidate prior browser evidence when source fingerprint changes.
- Prevent completion when evidence is stale, setup-gap, smoke-only for critical scenarios, or from a different run/goal identity.
- Require a review-critique-loop receipt before completion evidence is recorded for non-trivial code changes, browser/integration-required changes, phase closeout, or completion claims.
- Create closed `schemas/review-critique-loop.schema.json` as the Phase 05 receipt contract.
- The receipt must include `iterations[2]`, `effectiveReviewerCount`, reviewer ids and foci per iteration, `bundleDigest`, `candidate_id`, `sourceDigest`, parent resolution entries using the master plan enum, unresolved blocking count, and `closeoutEligible`.
- The review-critique-loop runs two iterations:
  - Iteration 1: up to three distinct independent reviewers critique the current work in parallel.
  - Parent integration 1: the main session revalidates findings and applies accepted fixes only.
  - Iteration 2: up to three distinct independent reviewers critique the updated work or confirm blocker resolution.
  - Parent integration 2: the main session records accepted, rejected, deferred, and blocking outcomes.
- Use `scripts/lib/review-bundle.mjs` as the bounded input artifact feeding the loop receipt. Do not store raw prompts, transcripts, hidden reasoning, or chat history.
- Critical, `replan_required`, and `human_decision` review findings block clean completion until accepted fixes land or a tracked blocker is recorded.
- Record verification-plane evidence before `assess-completion`.

## Acceptance Criteria

- Repair loop cannot skip tests, weaken assertions, or silently accept changed expected behavior.
- Completion remains rejected until required planes are present and fresh.
- Completion remains rejected when the required review-critique-loop receipt is missing, stale, from a different candidate/source digest, or has unresolved blocking findings.
- Runtime-state accepted completion remains the only whole-plan clean closeout authority.
- Human review is required when visual judgment, security, auth, data loss, or ambiguous requirements block automated repair.

## Implementation Decision

- `scripts/lib/review-bundle.mjs` now owns structured `REVIEW_CRITIQUE_LOOP_RECEIPT`, `REPAIR_PROMPT`, and `REPAIR_LOOP_RECEIPT` builders and blockers.
- `scripts/lib/verification-plane.mjs` consumes review and repair receipts as evidence gates. Browser/integration/critical tasks, phase closeout, and completion claims require a review-critique-loop receipt. Browser-required tasks require a `BROWSER_COMPLETION_RESULT`, not a hand-written browser plane.
- `scripts/runtime-state-store.mjs` still owns accepted completion authority. It rejects verification evidence with `requiredChecksPassed=false` and now surfaces the first task evidence blocker reason for better diagnostics.
- Review receipts are normalized before recording. Unknown fields, raw prompts/transcripts/chat history, digest mismatch, forged reviewer independence, forged blocking aggregates, candidate/source/bundle mismatch, and unresolved blocking dispositions all block.
- Repair evidence clamps `maxRepairAttempts` to `2`, preserves scenario identity and failing assertion ids, and blocks `repair_exhausted`, changed scenario reruns, or weakened assertion sets.

## Gates

```powershell
node --test tests/completion-authority-contract.test.mjs tests/verification-plane-contract.test.mjs
node --test tests/review-bundle-contract.test.mjs tests/review-finding-contract.test.mjs
npm test
```

## Phase Closeout

Independent review must test the false-positive path: static gates pass, browser evidence is missing, review-critique-loop evidence is missing or blocking, and completion must still be blocked. Accepted critique must be reflected in tests or documented as a tracked blocker.

Round 1 independent review found blockers in completion-claim review requirement, receipt sanitization, digest validation, repair-loop state, reviewer independence derivation, and forged blocking aggregates. All were accepted and fixed.

Round 2 independent review found no blockers after fixes. A non-blocking diagnostic issue was accepted and fixed so `assess-completion` exposes the task evidence blocker reason.
