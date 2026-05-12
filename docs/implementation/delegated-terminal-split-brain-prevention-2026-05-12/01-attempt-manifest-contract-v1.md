# Phase 01: Attempt Manifest Contract (v1)

## Source Mapping
| Req ID | Source Section | Requirement Summary | This Phase Handling |
|--------|----------------|---------------------|---------------------|
| REQ-1.1 | v4 Attempt manifest contract | Define schema version and enforcement flags. | Add manifest module and tests. |
| REQ-1.2 | v4 Attempt manifest contract | Record intent, child identity, exit result, and finalizer seal fields. | Wire attempt lifecycle patch points. |

## Acceptance Criteria
| AC ID | Source Requirement | Expected Evidence |
|-------|--------------------|-------------------|
| AC-01 | REQ-1.1 | `manifest-created-before-spawn` test proves intent is written before worker spawn. |
| AC-02 | REQ-1.2 | Tests prove missing child start time returns `worker_liveness_unknown` and finalizer seal fields are required downstream. |

## Goal
- Create one canonical attempt manifest contract for phase-runner attempts.

## Expected Outcome
- Every manifest-required phase attempt has an intent before spawn, child identity after spawn, exit patch after worker exit, and finalizer seal after completion decision.

## Phase Execution Metadata
```yaml
phaseExecution:
  schemaVersion: 1
  parallelEligible: false
  parallelGroup: "wave-1"
  dependsOn: []
  conflictsWith: []
  ownedPaths:
    - ".claude/scripts/lib/phase-attempt-manifest.mjs"
    - ".claude/scripts/lib/phase-attempt-manifest.test.mjs"
    - ".claude/scripts/agent-loop-phase-attempt.mjs"
    - ".claude/scripts/agent-loop-phase-runner.mjs"
  readOnlyPaths:
    - ".claude/scripts/lib/phase-execution-paths.mjs"
    - ".claude/scripts/lib/phase-event-ledger.mjs"
    - ".claude/docs/phase-status.yaml"
    - "docs/implementation/residual-harness-anomaly-v4-2026-05-12/**"
  sharedMutablePaths: []
  requiresManualEvidence: false
  mergePolicy: "sequential_foundation"
```

## Scope
- In scope:
  - Add `PHASE_ATTEMPT_MANIFEST_SCHEMA_VERSION = 1`.
  - Enforce manifest when `manifestRequired: true` or numeric `schemaVersion >= 1`.
  - Store all canonical attempt evidence under the execution root phase attempt directory using a single path convention.
  - Write intent fields: `attemptId`, `phaseNumber`, `runnerStartedAt`, `promptHash`, `commandHash`, `runnerLogPath`, `schemaVersion`, `manifestRequired: true`.
  - Patch child fields: `childPid`, `childProcessStartTime`.
  - Patch exit fields: `runnerFinishedAt`, `runnerExitCode`.
  - Support finalizer seal fields without making this phase own finalizer logic.
  - Append heartbeat JSONL events keyed by `attemptId`.
- Out of scope:
  - Completion gate rejection rules.
  - Orphan adoption.
  - Runtime pointer preparation.

## Preconditions and Inputs
- Required docs:
  - `docs/implementation/delegated-terminal-split-brain-prevention-2026-05-12/00-master-plan-v1.md`
- Required code:
  - Existing attempt lifecycle in `.claude/scripts/agent-loop-phase-attempt.mjs`.
  - Existing phase runner orchestration in `.claude/scripts/agent-loop-phase-runner.mjs`.

## Canonical Evidence Path Contract
```yaml
attemptManifestContract:
  schemaVersionConstant: "PHASE_ATTEMPT_MANIFEST_SCHEMA_VERSION = 1"
  attemptDirectory:
    convention: "<executionRoot>/<phaseSlug>/attempts/<attemptId>/"
    example: "docs/implementation/delegated-terminal-split-brain-prevention-2026-05-12/execution/v1/01-attempt-manifest-contract/attempts/attempt-20260512T000000Z/"
  manifestPath:
    relativeToAttemptDirectory: "attempt-manifest.json"
  heartbeatPath:
    relativeToAttemptDirectory: "attempt-heartbeat.jsonl"
  resolverApi:
    functionName: "resolvePhaseAttemptManifestPaths"
    module: ".claude/scripts/lib/phase-attempt-manifest.mjs"
    inputs:
      - "executionRoot"
      - "phaseNumber"
      - "phaseSlug"
      - "attemptId"
    outputs:
      - "attemptDirectory"
      - "manifestPath"
      - "heartbeatPath"
  writerApi:
    createIntent: "writeAttemptManifestIntent"
    patchChildIdentity: "patchAttemptManifestChildIdentity"
    patchExit: "patchAttemptManifestExit"
    patchFinalizerSeal: "patchAttemptManifestFinalizerSeal"
    appendHeartbeat: "appendAttemptHeartbeatEvent"
```

Rules:
- `attempt-manifest.json` is the canonical completion evidence for manifest-required attempts. Runner logs, projections, and phase-status YAML are supporting evidence only.
- `attempt-heartbeat.jsonl` is the canonical heartbeat stream for the same attempt directory and must include `attemptId` in every event.
- Callers must discover manifests only through `resolvePhaseAttemptManifestPaths`; hard-coded sibling paths or projection fallback are not allowed.
- A manifest-required attempt without an attempt directory from this resolver is incomplete, not grandfathered.

## Atomic Write And Patch Semantics
```yaml
atomicPatchSemantics:
  writeStrategy: "write-temp-fsync-rename"
  tempSuffix: ".tmp"
  lockScope: "single manifest path"
  patchRules:
    - patch operations must read the latest manifest, validate schemaVersion, merge only the owned field group, then atomically replace the file
    - intent fields are immutable after creation except for explicit schema migration in a later version
    - child identity patch may only add childPid and childProcessStartTime once
    - exit patch may only add runnerFinishedAt and runnerExitCode once
    - finalizer seal may only add completionTransactionId, finalizerTransactionId, verificationVerdictPath, and completionGateVerdict once
  crashSemantics:
    - missing manifest after spawn request: "missing_attempt_manifest"
    - manifest with intent but no child identity: "incomplete_attempt_manifest"
    - manifest with child identity but no exit patch: "incomplete_attempt_manifest"
    - start time collection failure: "worker_liveness_unknown"
```

## Detailed Tasks
| ID | Task | Steps | Done Criteria |
|----|------|-------|---------------|
| P01-1 | Add manifest module | 1) Define schema constant. 2) Add intent writer. 3) Add patch helpers. 4) Add reader/validator. | Module validates required fields and rejects partial states with stable reason codes. |
| P01-2 | Wire pre-spawn intent | 1) Resolve attempt directory with `resolvePhaseAttemptManifestPaths`. 2) Hash prompt and command. 3) Write `attempt-manifest.json` before child spawn. 4) Record `runnerLogPath`. | Test proves intent exists before spawn is invoked. |
| P01-3 | Wire child and exit patches | 1) Patch `childPid`. 2) Patch `childProcessStartTime`. 3) On collection failure, classify liveness unknown. 4) Patch exit fields. | Missing start time cannot be classified as worker-active. |
| P01-4 | Add heartbeat JSONL | 1) Append start/heartbeat/finish events to `attempt-heartbeat.jsonl`. 2) Include `attemptId`. 3) Keep projection files as readers, not truth. | Heartbeat event stream can be read by later telemetry. |

## Critical Product Scenarios
| ID | User-Visible Expectation | Verification Command | Expected Signal | Evidence Path |
|----|--------------------------|----------------------|-----------------|---------------|
| SCN-01-1 | A phase attempt cannot start without manifest intent when enforcement is enabled. | `node --test .claude/scripts/lib/phase-attempt-manifest.test.mjs` | `manifest-created-before-spawn` passes. | `.claude/scripts/lib/phase-attempt-manifest.test.mjs` |
| SCN-01-2 | A worker with missing start time is not treated as active. | `node --test .claude/scripts/lib/phase-attempt-manifest.test.mjs` | `child-start-time-missing-is-unknown` passes. | `.claude/scripts/lib/phase-attempt-manifest.test.mjs` |
| SCN-01-3 | Finished attempts include runner exit metadata. | `node --test .claude/scripts/lib/phase-attempt-manifest.test.mjs` | exit patch fields are present. | `.claude/scripts/lib/phase-attempt-manifest.test.mjs` |

## Exact Execution Targets
| ID | Files To Create | Files To Modify | Files To Test | Commands | Expected Fail/Pass Signals |
|----|-----------------|-----------------|---------------|----------|----------------------------|
| P01-1 | `.claude/scripts/lib/phase-attempt-manifest.mjs`, `.claude/scripts/lib/phase-attempt-manifest.test.mjs` | none | same | `node --test .claude/scripts/lib/phase-attempt-manifest.test.mjs` | exit 0 |
| P01-2 | none | `.claude/scripts/agent-loop-phase-attempt.mjs`, `.claude/scripts/agent-loop-phase-runner.mjs` | attempt manifest test | `node --test .claude/scripts/lib/phase-attempt-manifest.test.mjs` | intent written at `<executionRoot>/<phaseSlug>/attempts/<attemptId>/attempt-manifest.json` before spawn stub |

## Blockers And Review
- Blocker condition: no reliable hook exists before delegated-terminal child spawn.
- First review checkpoint: manifest field shape before wiring finalizer or verifier.
- Re-review trigger: any downstream phase composes manifest JSON directly instead of using the module.
- Verification evidence path: `docs/implementation/delegated-terminal-split-brain-prevention-2026-05-12/execution/v1/01-attempt-manifest-contract/QA_REPORT.md`

## Validation Plan
- [ ] `node --test .claude/scripts/lib/phase-attempt-manifest.test.mjs`
- [ ] `node --check .claude/scripts/lib/phase-attempt-manifest.mjs`
- [ ] `node --check .claude/scripts/agent-loop-phase-attempt.mjs`
- [ ] `node --check .claude/scripts/agent-loop-phase-runner.mjs`

## Deliverables
- Attempt manifest module and tests.
- Attempt lifecycle wiring for pre-spawn, child identity, exit patch, and heartbeat JSONL.

## Phase Completion Checklist
- [ ] Manifest intent is created before spawn.
- [ ] Child identity and exit metadata are patched after spawn/exit.
- [ ] Missing child start time maps to `worker_liveness_unknown`.
- [ ] Active residual package documents and runtime pointers are untouched.

## Handoff Notes
- Phase 02 must use the manifest reader/validator from this phase for completion gate decisions.
