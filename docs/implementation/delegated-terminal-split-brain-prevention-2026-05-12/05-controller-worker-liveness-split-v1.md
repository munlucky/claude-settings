# Phase 05: Controller Worker Liveness Split (v1)

## Source Mapping
| Req ID | Source Section | Requirement Summary | This Phase Handling |
|--------|----------------|---------------------|---------------------|
| REQ-5.1 | v4 Liveness policy | Worker-active requires matching child identity, command hash, and heartbeat attempt id. | Tighten liveness checker and lease projection. |
| REQ-5.2 | v4 Liveness policy | Missing start time is unknown; artifact progress is not completion evidence. | Add classifications and fixtures. |

## Acceptance Criteria
| AC ID | Source Requirement | Expected Evidence |
|-------|--------------------|-------------------|
| AC-09 | REQ-5.1 | `pid-reuse-not-worker-active` test rejects reused PID with mismatched start time or command hash. |
| AC-10 | REQ-5.2 | `child-start-time-missing-is-unknown` and artifact-progress-only fixtures do not promote completion. |

## Goal
- Separate stale controller state from real worker liveness.

## Expected Outcome
- `controller_stale_worker_active` appears only when manifest identity and heartbeat evidence match the same worker.

## Phase Execution Metadata
```yaml
phaseExecution:
  schemaVersion: 1
  parallelEligible: false
  parallelGroup: "wave-5"
  dependsOn:
    - "01"
    - "04"
  conflictsWith: []
  ownedPaths:
    - ".claude/scripts/lib/phase-liveness-checker.mjs"
    - ".claude/scripts/lib/phase-liveness-checker.test.mjs"
    - ".claude/scripts/lib/phase-run-lease-status.mjs"
    - ".claude/scripts/lib/phase-run-lease-status.test.mjs"
    - ".claude/scripts/lib/phase-run-lease-policy.mjs"
  readOnlyPaths:
    - ".claude/scripts/lib/phase-attempt-manifest.mjs"
    - ".claude/scripts/lib/phase-run-lease-store.mjs"
    - ".claude/scripts/runtime-state.mjs"
  sharedMutablePaths: []
  requiresManualEvidence: false
  mergePolicy: "sequential_liveness_policy"
```

## Scope
- In scope:
  - Require `childPid + childProcessStartTime + commandHash` match manifest.
  - Require heartbeat event `attemptId` match manifest.
  - Classify missing child start time as `worker_liveness_unknown`.
  - Classify artifact-only progress as `controller_stale_artifact_progress`.
  - Ensure artifact progress never promotes completion.
- Out of scope:
  - Completion gate verifier logic owned by Phase 02.
  - Alternate verifier policy owned by Phase 06.

## Preconditions and Inputs
- Phase 01 manifest heartbeat JSONL exists.
- Phase 04 transaction state prevents partial reconciliation success.

## Liveness Fixture Input Shapes
```yaml
livenessFixtures:
  startTimeUnavailable:
    manifest:
      attemptId: "attempt-start-time-unavailable"
      childPid: 4242
      childProcessStartTime: null
      commandHash: "sha256:command-a"
      manifestRequired: true
      schemaVersion: 1
    heartbeat:
      attemptId: "attempt-start-time-unavailable"
      childPid: 4242
      commandHash: "sha256:command-a"
    expectedClassification: "worker_liveness_unknown"
  pidReuse:
    manifest:
      attemptId: "attempt-original"
      childPid: 4242
      childProcessStartTime: "2026-05-12T01:00:00.000Z"
      commandHash: "sha256:command-a"
      manifestRequired: true
      schemaVersion: 1
    observedProcess:
      childPid: 4242
      childProcessStartTime: "2026-05-12T01:30:00.000Z"
      commandHash: "sha256:command-a"
    expectedClassification: "controller_stale_worker_inactive"
  heartbeatAttemptIdMismatch:
    manifest:
      attemptId: "attempt-a"
      childPid: 4242
      childProcessStartTime: "2026-05-12T01:00:00.000Z"
      commandHash: "sha256:command-a"
      manifestRequired: true
      schemaVersion: 1
    heartbeat:
      attemptId: "attempt-b"
      childPid: 4242
      childProcessStartTime: "2026-05-12T01:00:00.000Z"
      commandHash: "sha256:command-a"
    expectedClassification: "controller_stale_worker_inactive"
```

Rules:
- Do not synthesize fallback identity from PID, artifact mtime, runner log mtime, or heartbeat alone.
- If `childProcessStartTime` cannot be collected or is missing from manifest evidence, classification is `worker_liveness_unknown`.
- `controller_stale_worker_active` is allowed only when manifest `attemptId`, heartbeat `attemptId`, `childPid`, `childProcessStartTime`, and `commandHash` all match.
- Artifact progress without the full worker identity match is `controller_stale_artifact_progress` and cannot promote completion.

## Detailed Tasks
| ID | Task | Steps | Done Criteria |
|----|------|-------|---------------|
| P05-1 | Tighten worker identity match | 1) Read manifest child fields. 2) Compare PID/start time/command hash. 3) Compare heartbeat attempt id. | Only exact identity match becomes `controller_stale_worker_active`. |
| P05-2 | Add unknown classification | 1) Detect missing start time. 2) Return `worker_liveness_unknown`. 3) Preserve detail in status. | Unknown cannot become active or completed. |
| P05-3 | Add artifact progress classification | 1) Detect artifact movement without worker identity. 2) Return `controller_stale_artifact_progress`. | Artifact-only progress is diagnostic only. |
| P05-4 | Add PID reuse tests | 1) Same PID wrong start time. 2) Same PID wrong command hash. 3) Same heartbeat wrong attempt id. 4) Missing start time. | All reject worker-active; missing start time is `worker_liveness_unknown`. |

## Critical Product Scenarios
| ID | User-Visible Expectation | Verification Command | Expected Signal | Evidence Path |
|----|--------------------------|----------------------|-----------------|---------------|
| SCN-05-1 | Reused PID does not keep stale controller alive. | `node --test .claude/scripts/lib/phase-liveness-checker.test.mjs` | `pid-reuse-not-worker-active` passes. | `.claude/scripts/lib/phase-liveness-checker.test.mjs` |
| SCN-05-2 | Missing start time is unknown, not active. | `node --test .claude/scripts/lib/phase-liveness-checker.test.mjs` | `worker_liveness_unknown` appears. | `.claude/scripts/lib/phase-liveness-checker.test.mjs` |
| SCN-05-3 | Artifact progress alone cannot complete a phase. | `node --test .claude/scripts/lib/phase-run-lease-status.test.mjs` | `controller_stale_artifact_progress` remains non-completion. | `.claude/scripts/lib/phase-run-lease-status.test.mjs` |

## Exact Execution Targets
| ID | Files To Create | Files To Modify | Files To Test | Commands | Expected Fail/Pass Signals |
|----|-----------------|-----------------|---------------|----------|----------------------------|
| P05-1 | none | `.claude/scripts/lib/phase-liveness-checker.mjs` | `.claude/scripts/lib/phase-liveness-checker.test.mjs` | `node --test .claude/scripts/lib/phase-liveness-checker.test.mjs` | exit 0 |
| P05-2 | none | `.claude/scripts/lib/phase-run-lease-status.mjs`, `.claude/scripts/lib/phase-run-lease-policy.mjs` | `.claude/scripts/lib/phase-run-lease-status.test.mjs` | `node --test .claude/scripts/lib/phase-run-lease-status.test.mjs` | exit 0 |

## Blockers And Review
- Blocker condition: Windows process metadata cannot reliably provide start time and no fallback identity can be made collision-resistant.
- First review checkpoint: identity matching logic before wiring status projection.
- Re-review trigger: any artifact timestamp alone is used as completion evidence.
- Verification evidence path: `docs/implementation/delegated-terminal-split-brain-prevention-2026-05-12/execution/v1/05-controller-worker-liveness-split/QA_REPORT.md`

## Validation Plan
- [ ] `node --test .claude/scripts/lib/phase-liveness-checker.test.mjs`
- [ ] `node --test .claude/scripts/lib/phase-run-lease-status.test.mjs`
- [ ] `node --check .claude/scripts/lib/phase-liveness-checker.mjs`
- [ ] `node --check .claude/scripts/lib/phase-run-lease-status.mjs`

## Deliverables
- Strict liveness identity matcher.
- Worker unknown and artifact-progress-only classifications.
- PID reuse regression fixtures.

## Phase Completion Checklist
- [ ] Worker-active requires PID, start time, command hash, and heartbeat attempt id match.
- [ ] Missing start time is unknown.
- [ ] Artifact progress only is diagnostic and never completion.

## Handoff Notes
- Phase 07 should include liveness fixtures in the final E2E chain.
