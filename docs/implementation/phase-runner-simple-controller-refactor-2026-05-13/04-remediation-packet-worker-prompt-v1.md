# Phase 04: Remediation Packet and Worker Prompt (v1)

## Source Mapping
| Req ID | Source Section | Requirement Summary | This Phase Handling |
|--------|----------------|---------------------|---------------------|
| REQ-5.1 | v13 Remediation Packet | Create `remediation-request.json` from controller output plus hash metadata. | Add packet builder/writer and schema tests. |
| REQ-5.2 | v13 Prompt Injection | Include fresh failed cases and directives in next worker attempt prompt. | Extend prompt construction in runner. |
| REQ-5.3 | v13 Freshness | Ignore stale or superseded packet and never use it as completion evidence. | Add freshness checks and evidence exclusion tests. |

## Acceptance Criteria
| AC ID | Source Requirement | Expected Evidence |
|-------|--------------------|-------------------|
| AC-09 | REQ-5.1 | Tests prove packet contains controller output, `createdAt`, `sourceHash`, `sourceHashManifest`, and optional `supersededBy`. |
| AC-10 | REQ-5.2 | Tests prove the next worker prompt includes fresh failed cases and improvement directives. |
| AC-11 | REQ-5.3 | Tests prove stale/superseded packets are ignored and cannot satisfy review/verification/completion evidence. |

## Goal
- Make failure retries concrete and auditable without weakening completion evidence.

## Expected Outcome
- Controller-enforced failure paths emit a structured remediation packet.
- Next worker attempts receive precise failed cases, directives, must-read/must-rerun lists, prohibited actions, and retry strategy.
- Stale packet detection prevents old failure context from steering a new attempt.

## Phase Execution Metadata
```yaml
phaseExecution:
  schemaVersion: 1
  parallelEligible: false
  parallelGroup: "wave-4"
  dependsOn:
    - "01"
    - "02"
    - "03"
  conflictsWith: []
  ownedPaths:
    - ".claude/scripts/agent-loop-phase-runner.mjs"
    - ".claude/scripts/agent-loop-phase-artifacts.mjs"
    - ".claude/scripts/lib/phase-remediation-packet.mjs"
    - ".claude/scripts/lib/phase-remediation-packet.test.mjs"
    - ".claude/scripts/verify-phase-closeout.test.mjs"
    - ".claude/scripts/verify-plan-conformance.test.mjs"
  readOnlyPaths:
    - ".claude/scripts/lib/phase-loop-controller.mjs"
    - ".claude/scripts/phase-closeout-finalize.mjs"
    - ".claude/scripts/agent-loop-phase-plan-lib.mjs"
  sharedMutablePaths: []
  requiresManualEvidence: false
  mergePolicy: "sequential_prompt_and_artifact"
```

## Scope
- In scope:
  - Write `<phase-execution-dir>/remediation-request.json` on controller-enforced failure paths.
  - Add source hash manifest entries for existing refs and missing refs.
  - Hash active phase doc, sprint contract, remediation source evidence refs, verdict artifact path/content, verifier/finalizer result artifact path/content when present.
  - Ignore packet when `sourceHash` mismatches the current manifest or `supersededBy` exists.
  - Inject fresh failed cases and improvement directives into next worker prompt.
  - Prevent remediation packet paths from satisfying completion evidence.
- Out of scope:
  - Append-only `PHASE_LOOP_EVENTS.jsonl`.
  - Replay cache reconstruction.
  - Blocker fingerprint dedupe.

## Packet Contract
```json
{
  "schemaVersion": 1,
  "decision": "rerun_verify",
  "phaseNumber": 1,
  "attemptNumber": 2,
  "sourceDecisionId": "decision-phase-1-attempt-2-<hash>",
  "retryRecommended": true,
  "failedStage": "verify",
  "failedCases": [],
  "improvementDirectives": [],
  "evidenceRefs": [],
  "nextAttemptInput": {
    "mustRead": [],
    "mustRerun": [],
    "prohibitedActions": [],
    "retryStrategy": "same_direction_refine"
  },
  "createdAt": "ISO-8601",
  "sourceHash": "<hash>",
  "sourceHashManifest": {
    "hashed": [],
    "missing": []
  },
  "supersededBy": null
}
```

Rules:
- `failedCases[]` items use `{ id, stage, class, summary, command, artifactPath, observed, expected }`.
- `improvementDirectives[]` items use `{ id, targetStage, targetFiles, instruction, evidenceRequired }`.
- Missing refs are recorded in `sourceHashManifest.missing`; packet construction does not fail solely because optional refs are absent.
- Remediation packets are retry input only. They are not review evidence, verification evidence, closeout evidence, or completion evidence.

## Detailed Tasks
| ID | Task | Steps | Done Criteria |
|----|------|-------|---------------|
| P04-1 | Add packet module | 1) Build packet from controller output. 2) Add source hash manifest builder. 3) Add stale/superseded reader. | Packet schema tests pass. |
| P04-2 | Write packet on failure | 1) Locate controller-enforced failure path. 2) Write packet under phase execution dir. 3) Mark superseded when a newer packet is created if local pattern supports it. | Failure path creates packet without completing phase. |
| P04-3 | Inject prompt context | 1) Read only fresh packet. 2) Add failed cases/directives to next worker prompt. 3) Include must-read/must-rerun/prohibited actions. | Prompt fixture contains fresh directives and ignores stale packet. |
| P04-4 | Evidence exclusion | 1) Update conformance/closeout tests if needed. 2) Assert remediation path cannot satisfy completion evidence. | Completion evidence tests fail if only packet exists. |

## Critical Product Scenarios
| ID | User-Visible Expectation | Verification Command | Expected Signal | Evidence Path |
|----|--------------------------|----------------------|-----------------|---------------|
| SCN-04-1 | A finalizer failure produces a remediation packet through controller output. | `node --test .claude/scripts/lib/phase-remediation-packet.test.mjs .claude/scripts/agent-loop-phase-runner.test.mjs` | packet fixture includes decision and source hash manifest. | `.claude/scripts/lib/phase-remediation-packet.test.mjs` |
| SCN-04-2 | Stale or superseded remediation is ignored. | `node --test .claude/scripts/lib/phase-remediation-packet.test.mjs` | stale hash and superseded fixtures return no active packet. | `.claude/scripts/lib/phase-remediation-packet.test.mjs` |
| SCN-04-3 | Remediation packet cannot complete a phase. | `node --test .claude/scripts/verify-phase-closeout.test.mjs .claude/scripts/verify-plan-conformance.test.mjs` | packet-only evidence fixture is rejected. | closeout/conformance tests |

## Exact Execution Targets
| ID | Files To Create | Files To Modify | Files To Test | Commands | Expected Fail/Pass Signals |
|----|-----------------|-----------------|---------------|----------|----------------------------|
| P04-1 | `.claude/scripts/lib/phase-remediation-packet.mjs`, `.claude/scripts/lib/phase-remediation-packet.test.mjs` | none | same | `node --test .claude/scripts/lib/phase-remediation-packet.test.mjs` | schema, hash manifest, stale/superseded tests pass |
| P04-2 | optional runner fixtures | `.claude/scripts/agent-loop-phase-runner.mjs` | `.claude/scripts/agent-loop-phase-runner.test.mjs` | `node --test .claude/scripts/agent-loop-phase-runner.test.mjs` | controller failure writes packet |
| P04-3 | none | `.claude/scripts/agent-loop-phase-artifacts.mjs` or runner prompt builder path if current prompt lives there | runner/artifact tests | `node --test .claude/scripts/agent-loop-phase-runner.test.mjs` | next prompt includes fresh failed cases/directives |
| P04-4 | optional fixtures | `.claude/scripts/verify-phase-closeout.test.mjs`, `.claude/scripts/verify-plan-conformance.test.mjs` only if fixture coverage is absent | closeout/conformance tests | `node --test .claude/scripts/verify-phase-closeout.test.mjs .claude/scripts/verify-plan-conformance.test.mjs` | packet-only evidence rejected |

## Blockers And Review
- Blocker condition: prompt construction has no single insertion point for next-attempt context; inspect before adding a new abstraction.
- Review checkpoint: source hash manifest must record missing refs instead of throwing for absent optional artifacts.
- Verification evidence path: `docs/implementation/phase-runner-simple-controller-refactor-2026-05-13/execution/v1/04-remediation-packet-worker-prompt/QA_REPORT.md`

## Validation Plan
- [ ] `node --test .claude/scripts/lib/phase-remediation-packet.test.mjs`
- [ ] `node --test .claude/scripts/agent-loop-phase-runner.test.mjs`
- [ ] `node --test .claude/scripts/verify-phase-closeout.test.mjs`
- [ ] `node --test .claude/scripts/verify-plan-conformance.test.mjs`
- [ ] `node --check .claude/scripts/lib/phase-remediation-packet.mjs`
- [ ] `node --check .claude/scripts/agent-loop-phase-runner.mjs`

## Deliverables
- Remediation packet module and schema tests.
- Controller-enforced failure packet writer.
- Fresh packet prompt injection.
- Evidence exclusion regression coverage.

## Phase Completion Checklist
- [ ] Failure paths create `remediation-request.json` from controller output.
- [ ] `sourceHashManifest.missing` records absent refs without failing packet construction.
- [ ] Fresh failed cases and directives appear in next worker prompt.
- [ ] Stale or superseded packets are ignored.
- [ ] Remediation packet cannot satisfy completion evidence.

## Handoff Notes
- P1 can build two-phase finalizer and repair CLI semantics on top of this packet without changing controller decisions.
