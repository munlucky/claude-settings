# Phase 03: Manual Orphan Reconcile Mode (v1)

## Source Mapping
| Req ID | Source Section | Requirement Summary | This Phase Handling |
|--------|----------------|---------------------|---------------------|
| REQ-3.1 | v4 Manual orphan adoption | Delegated-terminal loop cannot use `--adopt-orphan`; adoption is manual reconcile only. | Add explicit mode guard and CLI boundary. |
| REQ-3.2 | v4 Manual orphan adoption | Adoption metadata and reverification commands are required. | Add metadata schema and verification gate. |

## Acceptance Criteria
| AC ID | Source Requirement | Expected Evidence |
|-------|--------------------|-------------------|
| AC-05 | REQ-3.1 | `delegated-loop-cannot-adopt-orphan` test proves auto-loop rejects adoption. |
| AC-06 | REQ-3.2 | Manual adoption without `adoptedBy`, `adoptionReason`, source paths, and reverification commands remains incomplete. |

## Goal
- Keep orphan projection adoption out of delegated-terminal automation.

## Expected Outcome
- Operators can explicitly reconcile orphan projection artifacts, but no automatic loop can turn them into completion.

## Phase Execution Metadata
```yaml
phaseExecution:
  schemaVersion: 1
  parallelEligible: false
  parallelGroup: "wave-3"
  dependsOn:
    - "01"
    - "02"
  conflictsWith: []
  ownedPaths:
    - ".claude/scripts/phase-closeout-reconciler.mjs"
    - ".claude/scripts/phase-closeout-reconciler.test.mjs"
    - ".claude/scripts/agent-loop.mjs"
    - ".claude/scripts/agent-loop-phase-state.mjs"
  readOnlyPaths:
    - ".claude/scripts/verify-phase-closeout.mjs"
    - ".claude/scripts/lib/phase-attempt-manifest.mjs"
  sharedMutablePaths: []
  requiresManualEvidence: true
  mergePolicy: "sequential_manual_gate"
```

## Scope
- In scope:
  - Add manual `reconcile` mode adoption path.
  - Reject `--adopt-orphan` from delegated-terminal loop and auto-reconciler paths.
  - Require adoption metadata: `adoptedBy`, `adoptionReason`, `sourceProjectionPaths`, `reverificationCommands`, `reconciledFrom: orphan_projection`.
  - Require verifier contract pass after adoption before completed status is allowed.
- Out of scope:
  - Automatic discovery and adoption of orphan artifacts.
  - Deleting orphan projection artifacts.

## Preconditions and Inputs
- Phase 02 emits `orphan_projection_completion` for non-canonical completion evidence.
- The manual operator supplies adoption metadata and exact reverification commands.

## CLI Boundary Contract
Forbidden delegated-terminal invocations:
```bash
node .claude/scripts/agent-loop.mjs docs/implementation/delegated-terminal-split-brain-prevention-2026-05-12 --adopt-orphan
node .claude/scripts/agent-loop-phase-state.mjs reconcile --adopt-orphan
node .claude/scripts/phase-closeout-reconciler.mjs --mode auto --adopt-orphan
```

Allowed manual reconcile invocation shape:
```bash
node .claude/scripts/phase-closeout-reconciler.mjs reconcile ^
  --mode manual ^
  --adopt-orphan ^
  --plan-dir docs/implementation/delegated-terminal-split-brain-prevention-2026-05-12 ^
  --phase 03 ^
  --adoption-metadata docs/implementation/delegated-terminal-split-brain-prevention-2026-05-12/execution/v1/03-manual-orphan-reconcile-mode/adoption-metadata.json
```

Rules:
- `--adopt-orphan` is valid only when the reconciler command explicitly uses `reconcile --mode manual`.
- `agent-loop.mjs`, delegated-terminal loop wrappers, and auto-reconciler entrypoints must reject `--adopt-orphan` with `delegated_loop_cannot_adopt_orphan`.
- Manual reconcile writes pending adoption evidence only; completion remains blocked until the verifier re-run command recorded in metadata passes.

## Adoption Metadata Schema
```yaml
adoptionMetadata:
  schemaVersion: 1
  path:
    convention: "<executionRoot>/<phaseSlug>/adoption-metadata.json"
    example: "docs/implementation/delegated-terminal-split-brain-prevention-2026-05-12/execution/v1/03-manual-orphan-reconcile-mode/adoption-metadata.json"
  requiredFields:
    adoptedBy: "manual operator id or session id"
    adoptionReason: "human-readable reason"
    reconciledFrom: "orphan_projection"
    sourceProjectionPaths:
      type: "array"
      minItems: 1
    reverificationCommands:
      type: "array"
      minItems: 1
      itemFields:
        command: "exact command string"
        cwd: "repository root or explicit working directory"
        expectedSignal: "exit 0 or named verifier pass"
    verifierRerunCapturePath:
      convention: "<executionRoot>/<phaseSlug>/reverification-commands.jsonl"
  completionGate:
    beforeVerifierPass: "adopted_but_unverified"
    afterVerifierPass: "eligible for Phase 02 canonical gate only if manifest/finalizer requirements are also satisfied"
```

## Detailed Tasks
| ID | Task | Steps | Done Criteria |
|----|------|-------|---------------|
| P03-1 | Add adoption schema | 1) Define metadata fields. 2) Validate source projection paths. 3) Require reverification commands. | Missing metadata blocks adoption. |
| P03-2 | Add manual reconcile mode | 1) Extend reconciler CLI with `reconcile --mode manual --adopt-orphan`. 2) Store adoption manifest at `<executionRoot>/<phaseSlug>/adoption-metadata.json`. 3) Capture verifier re-run commands at `<executionRoot>/<phaseSlug>/reverification-commands.jsonl`. 4) Do not mark completed before verifier pass. | Manual reconcile can produce pending adoption evidence only. |
| P03-3 | Block delegated loop adoption | 1) Reject forbidden invocation forms from the CLI boundary contract. 2) Add debug reason. 3) Keep exit non-success for misuse. | Auto-loop cannot adopt orphan evidence. |
| P03-4 | Add tests | 1) Auto-loop misuse. 2) Missing metadata. 3) Underrun reverification. 4) Valid manual pending adoption. | Tests cover allowed and denied paths. |

## Critical Product Scenarios
| ID | User-Visible Expectation | Verification Command | Expected Signal | Evidence Path |
|----|--------------------------|----------------------|-----------------|---------------|
| SCN-03-1 | Delegated-terminal loop cannot adopt orphan completion. | `node --test .claude/scripts/phase-closeout-reconciler.test.mjs` | `delegated-loop-cannot-adopt-orphan` passes. | `.claude/scripts/phase-closeout-reconciler.test.mjs` |
| SCN-03-2 | Manual adoption records why and from where it reconciled. | `node --test .claude/scripts/phase-closeout-reconciler.test.mjs` | adoption metadata is required. | `.claude/scripts/phase-closeout-reconciler.test.mjs` |
| SCN-03-3 | Adoption remains incomplete until verifier contract passes. | `node --test .claude/scripts/verify-phase-closeout.test.mjs` | adopted-but-unverified fixture fails completed gate. | `.claude/scripts/verify-phase-closeout.test.mjs` |

## Exact Execution Targets
| ID | Files To Create | Files To Modify | Files To Test | Commands | Expected Fail/Pass Signals |
|----|-----------------|-----------------|---------------|----------|----------------------------|
| P03-1 | none | `.claude/scripts/phase-closeout-reconciler.mjs` | `.claude/scripts/phase-closeout-reconciler.test.mjs` | `node --test .claude/scripts/phase-closeout-reconciler.test.mjs` | exit 0 |
| P03-2 | none | `.claude/scripts/agent-loop.mjs`, `.claude/scripts/agent-loop-phase-state.mjs` | reconciler and closeout tests | `node --test .claude/scripts/phase-closeout-reconciler.test.mjs .claude/scripts/verify-phase-closeout.test.mjs` | exit 0 |

## Blockers And Review
- Blocker condition: CLI cannot distinguish delegated-terminal auto-loop from manual reconcile invocation.
- First review checkpoint: adoption metadata schema before CLI wiring.
- Re-review trigger: any automation path sets `reconciledFrom: orphan_projection`.
- Verification evidence path: `docs/implementation/delegated-terminal-split-brain-prevention-2026-05-12/execution/v1/03-manual-orphan-reconcile-mode/QA_REPORT.md`

## Validation Plan
- [ ] `node --test .claude/scripts/phase-closeout-reconciler.test.mjs`
- [ ] `node --test .claude/scripts/verify-phase-closeout.test.mjs`
- [ ] `node --check .claude/scripts/phase-closeout-reconciler.mjs`
- [ ] `node --check .claude/scripts/agent-loop.mjs`

## Deliverables
- Manual orphan reconcile mode.
- Delegated-terminal adoption rejection.
- Adoption metadata and reverification gate tests.

## Phase Completion Checklist
- [ ] Delegated-terminal loop cannot adopt orphan projection.
- [ ] Manual adoption metadata is required.
- [ ] Adoption cannot mark completion before verifier pass.

## Handoff Notes
- Phase 04 must make manual reconcile changes transactional and resumable.
