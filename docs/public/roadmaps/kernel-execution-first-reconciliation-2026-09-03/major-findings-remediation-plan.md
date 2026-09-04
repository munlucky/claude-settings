# Moonshot Relay Kernel — Execution-First Major Findings Remediation Plan

**Document Status:** Complete Remediation Plan (Post SOL High Independent Review & Final Wave Verification)<br>
**Date:** 2026-09-04<br>
**Target Repository:** `munlucky/moonshot-relay` (Kernel Mode)<br>
**Base Commit:** `f6b72ffadff8151caf2be2a87508f66a0d4b3d5e`<br>
**Review Source:** Independent `gpt-5.6-sol / high` Audit

---

## 1. Executive Summary & Remediation Scope

The independent review evaluated the Execution-First & Final Reconciliation refactoring against the canonical Kernel contract. Static analysis passed, but the audit identified five P1 integrity gaps, six P2 edge cases, surface budget calibration requirements, and absent roadmap traceability in the repository.

This remediation plan documents the root causes, architecture boundaries, component modifications, and verification evidence for all findings across six structured waves:

| Wave / ID | Severity | Area | Root Cause & Remediation Summary | Target Files |
|---|---|---|---|---|
| **Wave 1 (P1-3)** | P1 | Physical Path Safety Fail-Closed | Lexical `path.resolve` check in preflight failed to catch symlinks and Windows junctions escaping the repo root. Added ancestor `lstatSync` and `realpathSync` component walk with injectable resolvers. Broken symlinks and out-of-root links fail closed; normal nested non-existing files under verified repo ancestors succeed. | `scripts/kernel/run/contract-preflight.mjs`, `tests/kernel-preflight-execution-first.test.mjs` |
| **Wave 2 (P1-1, P1-5)** | P1 | Authentic Provider & Reviewer E2E | Subagent review test manually synthesized receipts, and native dispatch did not reliably bind capabilities. Refactored test to pass empty `actionContext = {}` and invoke production adapter launcher. Strictly separated Tier 1 deterministic contract E2E (`npm test`) from Tier 2 installed native provider smoke (`npm run test:provider-smoke`). | `tests/kernel-subagent-review.test.mjs`, `tests/kernel-provider-smoke.test.mjs`, `package.json` |
| **Wave 3 (P1-4)** | P1 | Cross-Process Knowledge Lock Hardening | `acquireNamespaceLock` threw immediately on `EEXIST` or used sync busy-spin loops. Eliminated `Atomics.wait` and busy-spin; implemented sync one-shot `tryAcquireNamespaceLock` and async bounded retry `acquireNamespaceLockWithRetry` using `node:timers/promises`. Added dead-owner stale lock cleanup. Proven via multi-process barrier contention tests. | `scripts/kernel/knowledge/store.mjs`, `tests/kernel-concurrent-commit.test.mjs` |
| **Wave 4 (P2-3)** | P2 | Canonical Knowledge Identity & Idempotent CAS | Racing commits risked duplicate insertions, and candidate identity did not normalize aliases or scope. Exported `canonicalKnowledgeIdentity({ recordType, statement, scope })` from `capture.mjs`. In `state-store.mjs`, implemented same-batch deduplication, idempotent no-change on existing committed knowledge without advancing revision, and idempotent supersession handling. | `scripts/kernel/knowledge/capture.mjs`, `scripts/kernel/state-store.mjs`, `tests/kernel-concurrent-commit.test.mjs` |
| **Wave 5 (P0/P1)** | P1 (🔴 Critical) | Knowledge Review Decoupling & Bounded Recovery | Knowledge review failure (`rejected`, `needs_approval`) previously blocked code delivery with `completionStatus: 'blocked'`. Reordered finalization stages: (1) Preflight code gates $\to$ (2) CLOSE & persist accepted completion authority $\to$ (3) Execute Git closeout $\to$ (4) Review & commit knowledge. Knowledge review failure defers knowledge safely without blocking code completion (`completionStatus: 'accepted'`, `finalizationStatus: 'completed'`). Added bounded post-finalization recovery draining at most 1 previous deferred run independently. | `scripts/kernel/run/finalization.mjs`, `scripts/kernel/state-store.mjs`, `tests/kernel-finalization-knowledge-nonblocking.test.mjs` |
| **Wave 6** | Quality | Final Verification & Surface Governance | Preserved surface budget under original `allowedDelta` (3,500 lines, 172,000 bytes, 43,000 tokens). Executed full verification suite with 0 failures across 33 active tests. | `package/harness-surface-budget.json`, test inventory |

---

## 2. Detailed Technical Remediation

### 2.1 Wave 1: Physical Symlink/Junction Escape Detection at Turn 0 Preflight
- **Problem**: Lexical string matching allowed symlinks or Windows directory junctions pointing outside the repository to pass Turn 0 preflight. Empty `catch {}` blocks risked swallowing permission errors.
- **Solution**:
  1. `normalizeRepositoryPath` in `contract-preflight.mjs` performs component-wise inspection using injectable `{ resolveRealpath = realpathSync, checkExists = existsSync, lstatPath = lstatSync }`.
  2. Differentiates failure reasons: `repository-realpath-unavailable`, `ancestor-realpath-unavailable`, `broken-link`, and `out-of-root-symlink`.
  3. Trailing non-existing components under a physically verified canonical repository ancestor are cleanly permitted as new files.
  4. Verified across 9 scenarios in `tests/kernel-preflight-execution-first.test.mjs`.

### 2.2 Wave 2: Dual-Tier Provider / Reviewer E2E
- **Problem**: Subagent tests manually synthesized receipts, and smoke tests were not segregated from deterministic CI runs.
- **Solution**:
  1. Updated `tests/kernel-subagent-review.test.mjs` to exercise production `cp.recordReview()` ingestion and verified that empty `actionContext = {}` resolves `executionMode: 'native-subagent'` based strictly on host capabilities.
  2. Created standalone `tests/kernel-provider-smoke.test.mjs` invoked exclusively via `npm run test:provider-smoke`.
  3. Matrix cleanly reports `PASS`, `FAIL`, and `SKIP_*` (`SKIP_NOT_INSTALLED`, `SKIP_BRIDGE_UNAVAILABLE`) across all 6 surfaces (Claude CLI/desktop, Codex CLI/desktop, Qwen CLI, Antigravity desktop).

### 2.3 Wave 3: Cross-Process Knowledge Namespace Lock Hardening
- **Problem**: `acquireNamespaceLock` used a synchronous busy-spin loop (`while (Date.now() < sleepEnd) {}`) that froze the event loop, and failed immediately on lock contention.
- **Solution**:
  1. Provided `tryAcquireNamespaceLock(projectsRoot, projectId, { allowReentrant })` for synchronous one-shot attempts.
  2. Provided `acquireNamespaceLockWithRetry(projectsRoot, projectId, { allowReentrant, retries = 60, retryDelayMs = 50, staleTimeoutMs = 30000 })` using non-blocking `setTimeout` from `node:timers/promises`.
  3. Implemented `clearStaleNamespaceLock` inspecting lock PID liveness via `process.kill(pid, 0)` and timestamp expiration.
  4. Tested barrier contention, timeout without blocking the event loop, and dead-owner cleanup in `tests/kernel-concurrent-commit.test.mjs`.

### 2.4 Wave 4: Canonical Knowledge Identity & Idempotent CAS
- **Problem**: Inconsistent candidate typing and casing caused duplicate records or revision inflation when identical knowledge was resubmitted.
- **Solution**:
  1. In `scripts/kernel/knowledge/capture.mjs`, exported `canonicalKnowledgeType` and `canonicalKnowledgeIdentity({ recordType, statement, scope })`.
  2. In `scripts/kernel/state-store.mjs:commitKnowledgeTransaction`:
     - Applied same-batch deduplication across candidate inputs.
     - Compared candidate identities against committed records; if all candidates are already committed and active supersessions are empty, returns `status: 'no_change'` without incrementing the revision.
     - Supersessions against already superseded records are treated as idempotent no-ops.

### 2.5 Wave 5: Knowledge Review Decoupling & Bounded Recovery (🔴 Critical)
- **Problem**: In `finalization.mjs`, knowledge review failure (`reviewResult.status !== 'passed'`) returned `completionStatus: 'blocked'`, preventing code acceptance and Git closeout even when all code proofs had passed.
- **Solution**:
  1. **Stage Decoupling**: Reordered finalization stages:
     - **Stage 1**: Preflight completion code gates $\to$ Transition to `CLOSE` $\to$ Persist `decision: 'accepted'`.
     - **Stage 2**: Execute Git closeout if requested. Authorized closeout proceeds independently and does not require a prior knowledge commit receipt.
     - **Stage 3**: Review knowledge candidates (`reviewKnowledgeCandidates`) $\to$ Commit knowledge via CAS.
     - **Stage 4**: If knowledge review fails (`failed`, `needs_approval`, `rejected`) or CAS retries exhaust, knowledge is marked `deferred`. Crucially, `completionStatus` remains `accepted` and `finalizationStatus` remains `completed`.
  2. **Bounded Post-Finalization Recovery**: After current run finalization completes, `recoverBoundedDeferredKnowledge` queries the store for at most 1 previous deferred run for the project (`maxDeferredRuns = 1`), and reconciles and commits its candidates under its own Run ID and provenance.
  3. Tested in `tests/kernel-finalization-knowledge-nonblocking.test.mjs`: verified rejection decoupling and process-restart recovery.

---

## 3. Verification Matrix

| Verification Suite | Target | Result | Evidence |
|---|---|---|---|
| `npm run lint:kernel` | 713 static code checks | **Pass** | Clean exit 0, no lint violations |
| `tests/kernel-preflight-execution-first.test.mjs` | Wave 1: Fail-closed path safety, symlink/junction escape, broken links | **Pass** (9/9) | Duration: ~4.5s |
| `tests/kernel-subagent-review.test.mjs` | Wave 2: Subagent capability dispatch, production receipt ingestion | **Pass** (3/3) | Duration: ~2.2s |
| `tests/kernel-concurrent-commit.test.mjs` | Wave 3 & 4: Async lock retry, barrier contention, timeout, stale lock cleanup, CAS dedup | **Pass** (6/6) | Duration: ~6.1s |
| `tests/kernel-finalization-knowledge-nonblocking.test.mjs` | Wave 5: Knowledge review decoupling, nonblocking git closeout, restart recovery | **Pass** (3/3) | Duration: ~7.2s |
| `tests/kernel-run-locator-fail-soft.test.mjs` | Stale locator fresh run isolation, explicit run-id fail closed | **Pass** (3/3) | Duration: ~3.7s |
| `tests/kernel-bounded-work-unit.test.mjs` | Step strictBoundedScope, replan unblock blocking_class reset | **Pass** (6/6) | Duration: ~4.1s |
| `tests/kernel-cross-surface-matrix.test.mjs` | Cross-surface matrix capability normalization and dispatch | **Pass** (2/2) | Duration: ~6.5s |
| `tests/kernel-context-bootstrap-degraded.test.mjs` | Degraded/ready-empty context bootstrap | **Pass** (2/2) | Duration: ~0.3s |
| `tests/kernel-execution-first-baseline.test.mjs` | Baseline project identity and isolation | **Pass** (3/3) | Duration: ~2.8s |
| `tests/kernel-final-reconciliation.test.mjs` | Turn 0 execution-first git diff reconciliation | **Pass** (1/1) | Duration: ~5.0s |
| `tests/kernel-worktree-concurrency-downgrade.test.mjs` | Concurrent worktree writer downgrade | **Pass** (1/1) | Duration: ~2.8s |
| `npm run test:active:3` | Combined active execution-first regression suite | **Pass** (33/33) | Duration: ~10.3s |
| `npm run test:provider-smoke` | Tier 2 installed native provider smoke matrix | **Pass** (4 pass, 3 skip) | CLI pass, desktop skip |
| `node scripts/harness-surface-report.mjs check --json` | Surface budget governance compliance | **Pass** | 0 blockers under original allowedDelta |
