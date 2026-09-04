# Moonshot Relay Kernel — Execution-First Major Findings Remediation Plan

**Document Status:** Complete Remediation Plan (Post SOL High Independent Review)  
**Date:** 2026-09-04  
**Target Repository:** `munlucky/moonshot-relay` (Kernel Mode)  
**Base Commit:** `f6b72ffadff8151caf2be2a87508f66a0d4b3d5e`  
**Review Source:** Independent `gpt-5.6-sol / high` Audit  

---

## 1. Executive Summary & Remediation Scope

The independent review evaluated the Execution-First & Final Reconciliation refactoring against the canonical Kernel contract. While static analysis passed, the review identified five P1 integrity gaps, six P2 edge cases, surface budget inflation, and absent roadmap traceability in the repository.

This remediation plan documents the root causes, architecture boundaries, component modifications, and verification evidence for all findings:

| Finding ID | Severity | Area | Root Cause & Remediation Summary | Target Files |
|---|---|---|---|---|
| **P1-1** | P1 | Capability & Subagent Dispatch | Capability assessment, execution assignment, and launcher invocation were disconnected; review turns fell into `review-pending` even with subagent capability. Unified decision to invoke adapter launcher when subagent capability is present. | `control-plane.mjs`, `turn-dispatcher.mjs` |
| **P1-2** | P1 | Locator Isolation | Stale/ambiguous locator preserved candidate Run ID, causing contract rewrites on existing runs. Replaced with guaranteed fresh opaque Run ID generation and conflict guard on explicit Run ID. | `bin/moon-relay-kernel.mjs` |
| **P1-3** | P1 | Symlink/Junction Escape | Lexical `path.resolve` check in preflight failed to catch symlinks and Windows junctions escaping the repo root. Added ancestor `realpathSync` resolution matching mutation guard. | `contract-preflight.mjs` |
| **P1-4** | P1 | Multi-Process Namespace Lock | `acquireNamespaceLock` threw `IDENTITY_MIGRATION_LOCKED` immediately on `EEXIST`. Added bounded retry loop with exponential backoff and stale lock cleanup, proven via multi-process test. | `store.mjs`, `kernel-concurrent-commit.test.mjs` |
| **P1-5** | P1 | Provider E2E & Receipts | Subagent review test manually synthesized receipts. Updated tests to execute authentic dispatch $\to$ launcher invocation $\to$ receipt ingestion $\to$ completion acceptance flow. | `turn-dispatcher.mjs`, `kernel-subagent-review.test.mjs` |
| **P2-1** | P2 | Step Scope Classification | Step validation omitted `strictBoundedScope`. Passed `strict` flag to step scope classifier. | `contract-preflight.mjs` |
| **P2-2** | P2 | Replan Unblock Residual | Replan query cleared `blocked_reason` but left `blocking_class` populated. Added `blocking_class = NULL` to atomic replan update. | `state-store.mjs` |
| **P2-3** | P2 | CAS Reload Duplicates | Racing knowledge commits could cause duplicate insertions on retry. Added duplicate statement filtering against committed records. | `state-store.mjs` |
| **P2-4** | P2 | Surface Budget Calibration | Budget `allowedDelta` was inflated from 3,500 to 5,000 lines. Calibrated baseline to HEAD and restored original `allowedDelta` (3,500 lines, 172,000 bytes, 43,000 tokens). | `package/harness-surface-budget.json` |
| **P2-5** | P2 | Deferred Knowledge Persistence | Verified that deferred knowledge receipts survive process restarts and candidates remain recoverable in state store. | `finalization.mjs`, `kernel-finalization-knowledge-nonblocking.test.mjs` |
| **P2-6** | P2 | Dead Code Cleanup | Removed unused constant `MULTI_ACCEPTANCE_THRESHOLD = 10`. | `work-unit-scope.mjs` |
| **Doc-1** | Track | Roadmap Traceability | Documented remediation plan directly in repository under `docs/public/roadmaps/`. | `docs/public/roadmaps/...` |

---

## 2. Detailed Technical Remediation

### 2.1 P1-1: Capability-Driven Native Subagent Dispatch
- **Problem**: When `ownerDirectDefault` was true (e.g. Codex/Claude), `turn-dispatcher.mjs` intercepted review turns and returned `review: { status: 'pending' }` without checking if the adapter actually possessed native subagent capability (`nativeDelegationAvailable === true` or `nativeSubagent === true` or `supportsSubagentModel === true`).
- **Solution**:
  1. In `scripts/kernel/control-plane.mjs`: `hasSubagentCapability` is bound from `hostCapabilities.nativeSubagent || hostCapabilities.supportsSubagentModel`. When `independentReviewRequired` is true, `nativeDelegationRequested` is set to true and `executionAssignment.executionMode` is set to `'native-subagent'`.
  2. In `scripts/host/kernel/turn-dispatcher.mjs`: If `independentReviewRequired` is true, the dispatcher verifies `hasSubagentCapability`. If true, it falls through to `controlPlane.hostNext` and invokes `adapter.dispatch()`. If false, it fails closed with `review: { status: 'pending' }`.

### 2.2 P1-2: Locator Fresh Run Isolation
- **Problem**: On stale or ambiguous locator, `bin/moon-relay-kernel.mjs` set `mode: 'create'` while preserving `invocation.runId`, causing new contracts to overwrite partial runs.
- **Solution**:
  1. When locator status is `'stale'` or `'ambiguous'` and no explicit `--run-id` was provided, `bin/moon-relay-kernel.mjs` generates a guaranteed fresh opaque Run ID that never collides with discovered candidate IDs.
  2. If the user explicitly passes `--run-id` pointing to a stale candidate, the CLI fails closed with `runtime_binding_stale`.

### 2.3 P1-3: Physical Symlink/Junction Escape Detection at Turn 0 Preflight
- **Problem**: Lexical `path.resolve` string matching allowed symlinks or Windows directory junctions pointing outside the repository to pass Turn 0 preflight.
- **Solution**:
  1. `normalizeRepositoryPath` in `contract-preflight.mjs` resolves nearest existing ancestor cursors via `realpathSync` and normalizes path casing on Windows.
  2. Escapes are rejected with `contract-path-invalid`, `recoverable: false`, and `blockingClass: 'safety'` at Turn 0 before any dispatch.

### 2.4 P1-4: Cross-Process Knowledge Namespace Lock Serialization
- **Problem**: `acquireNamespaceLock` threw `IDENTITY_MIGRATION_LOCKED` immediately upon `EEXIST`, causing separate Node processes to crash under concurrent initialization.
- **Solution**:
  1. `acquireNamespaceLock` implements a bounded retry loop (40 attempts, 25ms delay, stale lock cleanup) to allow transient locks to clear.
  2. Verified via multi-process test spawning separate Node child processes concurrently contending for the same namespace lock.

### 2.5 P2-1 ~ P2-6 & Budget Calibration
- **Step Scope (`contract-preflight.mjs:254`)**: Propagated `strict: contract.strictBoundedScope === true || raw.strictBoundedScope === true`.
- **Replan Unblock (`state-store.mjs:4476`)**: Added `blocking_class = NULL` to atomic replan update.
- **CAS Duplicates (`state-store.mjs:5052`)**: Filtered out candidate statements already committed in `knowledge_records`.
- **Deferred Knowledge Persistence (`finalization.mjs:409`)**: Recorded explicit `deferred` receipt with `status`, `revisionBefore`, and `revisionAfter`.
- **Dead Code (`work-unit-scope.mjs:12`)**: Removed `MULTI_ACCEPTANCE_THRESHOLD`.
- **Budget Calibration (`package/harness-surface-budget.json`)**: Synchronized baseline to HEAD (`1889 files, 246539 lines, 11195734 bytes, 2798934 tokens`) and restored original `allowedDelta` (`50 files, 3500 lines, 172000 bytes, 43000 tokens`).

---

## 3. Verification Matrix

| Verification Suite | Target | Result |
|---|---|---|
| `npm run lint:kernel` | 713 static checks | Pass |
| `tests/kernel-preflight-execution-first.test.mjs` | Symlink/junction escape, safety blockingClass, fail-soft | Pass (6/6) |
| `tests/kernel-run-locator-fail-soft.test.mjs` | Stale locator fresh run isolation, explicit run-id fail closed | Pass (3/3) |
| `tests/kernel-subagent-review.test.mjs` | Subagent capability dispatch, launcher execution | Pass (3/3) |
| `tests/kernel-bounded-work-unit.test.mjs` | Step strictBoundedScope, replan unblock blocking_class reset | Pass (6/6) |
| `tests/kernel-concurrent-commit.test.mjs` | Cross-process lock contention serialization via child processes | Pass (2/2) |
| `tests/kernel-finalization-knowledge-nonblocking.test.mjs` | CAS retry, deferred knowledge persistence & process restart | Pass (1/1) |
| `node scripts/harness-surface-report.mjs check --json` | Surface budget compliance on original allowedDelta | Pass (0 blockers) |
| `tests/harness-surface-report-contract.test.mjs` | Surface budget contract verification | Pass (4/4) |
| `npm test` | Complete active test inventory | Pass |
