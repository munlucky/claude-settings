# Phase 1 - Reconciliation Intent Resolved Evidence Guard

## Objective

Close the same-attempt reconciliation bypass by requiring both strict intent fields and a resolved blocker evidence record before `blocked -> active` can be accepted for the same attempt.

## Ownership

### Mutable Paths

- `.claude/scripts/lib/simple-run-state.mjs`
- `.claude/scripts/lib/simple-run-state.test.mjs`
- `.claude/scripts/agent-loop-phase-runner.mjs`
- `.claude/scripts/agent-loop-phase-runner.test.mjs`

### Read-Only Reference Paths

- `.claude/scripts/lib/terminal-blocker-publisher.mjs`
- `.claude/scripts/lib/blocker-sidecar-state.mjs`
- `.claude/scripts/blocker-closeout-prevention.e2e.test.mjs`

### Parallelism

`parallelEligible: false`

Reason: this phase changes a shared state transition guard and its runner integration. Run sequentially to avoid conflicting edits in the same validation surface.

## Implementation Steps

### Step 1: Add Strict Intent Schema Validation

Update `validateReconciliationIntent(options)` to require:

- `options.attemptId`
- `intent.intent === "resume_blocked_attempt"`
- `intent.resumeReason === "blocker_resolved"`
- intent `stateRunId`, `attemptId`, `transactionId`, `blockerEvidenceId`, and `projectionManifestSha256` all match expected values

Use stable error codes. Recommended codes:

- `reconciliation_intent_type_mismatch`
- `reconciliation_intent_resume_reason_mismatch`
- `reconciliation_intent_attemptId_mismatch`

### Step 2: Require Resolved Blocker Evidence

Replace the current "id exists" JSONL check with a helper that returns the matching resolved record.

The accepted record must satisfy:

- `record.id === blockerEvidenceId`
- `record.status === "resolved"`
- `record.transactionId === transactionId`
- `record.attemptId === attemptId`
- `record.stateRunId === stateRunId`

Use stable error codes:

- `reconciliation_intent_blocker_evidence_missing`
- `reconciliation_intent_blocker_not_resolved`
- `reconciliation_intent_blocker_transaction_mismatch`
- `reconciliation_intent_blocker_attempt_mismatch`
- `reconciliation_intent_blocker_state_run_mismatch`

Diagnostic priority:

1. no record with matching `id`: `reconciliation_intent_blocker_evidence_missing`
2. matching `id` exists, but no `status === "resolved"` record: `reconciliation_intent_blocker_not_resolved`
3. matching resolved record exists, but none match `transactionId`: `reconciliation_intent_blocker_transaction_mismatch`
4. matching resolved transaction record exists, but none match `attemptId`: `reconciliation_intent_blocker_attempt_mismatch`
5. matching resolved transaction and attempt record exists, but none match `stateRunId`: `reconciliation_intent_blocker_state_run_mismatch`

Implementation contract:

```js
function findResolvedBlockerEvidenceRecord(records, expected) {
  const normalized = records.map((record) => ({
    record,
    id: String(record.id || '').trim(),
    status: String(record.status || '').trim(),
    transactionId: String(record.transactionId || '').trim(),
    attemptId: String(record.attemptId || '').trim(),
    stateRunId: String(record.stateRunId || '').trim(),
  }));

  const exact = normalized.find(({ id, status, transactionId, attemptId, stateRunId }) => (
    id === expected.blockerEvidenceId
    && status === 'resolved'
    && transactionId === expected.transactionId
    && attemptId === expected.attemptId
    && stateRunId === expected.stateRunId
  ));
  if (exact) {
    return exact.record;
  }

  if (!normalized.some((item) => item.id === expected.blockerEvidenceId)) {
    throw codeError('reconciliation_intent_blocker_evidence_missing');
  }
  if (!normalized.some((item) => item.id === expected.blockerEvidenceId && item.status === 'resolved')) {
    throw codeError('reconciliation_intent_blocker_not_resolved');
  }
  if (!normalized.some((item) => item.id === expected.blockerEvidenceId && item.status === 'resolved' && item.transactionId === expected.transactionId)) {
    throw codeError('reconciliation_intent_blocker_transaction_mismatch');
  }
  if (!normalized.some((item) => item.id === expected.blockerEvidenceId && item.status === 'resolved' && item.transactionId === expected.transactionId && item.attemptId === expected.attemptId)) {
    throw codeError('reconciliation_intent_blocker_attempt_mismatch');
  }
  throw codeError('reconciliation_intent_blocker_state_run_mismatch');
}
```

### Step 3: Pass Attempt Context from Runner

Update `resolveRunnerReconciliationIntentOptions(...)` so the validation options include the requested same-attempt id.

Required signature:

```js
export function resolveRunnerReconciliationIntentOptions(
  stateRunId,
  runRoot = '',
  { resume = state.resume, attemptId = '' } = {},
) {
  const normalizedAttemptId = String(attemptId || '').trim();
  // returned validation options must include attemptId: normalizedAttemptId
}
```

Required call-site shape:

```js
const attemptId = currentSimpleRunAttemptId();
const guard = assessWorkerSpawnStateGuard(readResult, {
  attemptId,
  reconciliationIntentOptions: resolveRunnerReconciliationIntentOptions(
    state.stateRunId,
    readResult?.state?.runRoot,
    { resume: state.resume, attemptId },
  ),
});
```

`assessWorkerSpawnStateGuard()` must expose `validateReconciliationIntent()` failures through a stable `detailCode` field. Tests and debug assertions should use `detailCode`, not the human-readable message.

Required catch contract:

```js
return {
  allowed: false,
  reason: 'reconciliation_intent_invalid',
  status,
  projectionStatus,
  boardAttempt,
  detail: error instanceof Error ? error.message : String(error),
  detailCode: error && typeof error === 'object' && 'code' in error
    ? String(error.code || '')
    : 'reconciliation_intent_unknown_error',
};
```

Expected runner behavior:

- same attempt + valid resolved evidence: `allowed: true`
- same attempt + open-only evidence: `allowed: false`
- same attempt + invalid intent fields: `allowed: false`

Do not weaken the existing `projectionStatus=pending`, `complete`, or `cancelled` hard rejects.

### Step 4: Add Focused Tests

Add or update `simple-run-state.test.mjs`:

- missing `options.attemptId` rejects
- missing `intent.attemptId` rejects
- open-only blocker evidence rejects same-attempt reconciliation
- resolved blocker evidence accepts same-attempt reconciliation
- multiple records pass only when one resolved record matches `id`, `status`, `transactionId`, `attemptId`, and `stateRunId` together
- wrong `intent` rejects
- wrong `resumeReason` rejects
- wrong intent `attemptId` rejects
- resolved evidence transaction mismatch rejects
- resolved evidence missing or wrong `attemptId` rejects with `reconciliation_intent_blocker_attempt_mismatch`
- resolved evidence missing or wrong `stateRunId` rejects with `reconciliation_intent_blocker_state_run_mismatch`

Add or update `agent-loop-phase-runner.test.mjs`:

- `STATE.md=blocked`, same attempt, valid-looking intent, open-only evidence => guard rejects with `detailCode: "reconciliation_intent_blocker_not_resolved"`
- same fixture with resolved evidence append => guard allows
- invalid reconciliation intent => guard rejects and `detailCode` mirrors `validateReconciliationIntent()` error code

## Edge Cases

- Reconciliation intent must never omit `attemptId`.
- Resolved blocker evidence must never omit `attemptId` or `stateRunId`.
- Multiple JSONL records for the same blocker id are valid only if at least one resolved record matches the expected transaction and attempt context.
- Global reconciliation intent alias remains compatibility-only and must retain stateRunId mismatch rejection.

## Verification

Run:

```powershell
node --test .claude/scripts/lib/simple-run-state.test.mjs
node --test .claude/scripts/agent-loop-phase-runner.test.mjs
node --test .claude/scripts/lib/terminal-blocker-publisher.test.mjs
node --test .claude/scripts/blocker-closeout-prevention.e2e.test.mjs
git diff --check
```

Optional broader guard after the focused tests pass:

```powershell
node --test .claude/scripts/lib/harness-state-invariants.test.mjs
node --test .claude/scripts/lib/lifecycle-projection-writer.test.mjs
node --test .claude/scripts/lib/phase-run-lease-store.test.mjs
```

## Done Criteria

- The open-only reproduction returns rejected, not accepted.
- Same-attempt resume remains possible only with resolved evidence and exact intent fields.
- Terminal publisher behavior remains compatible with open blocker publication.
- Required verification commands pass.
