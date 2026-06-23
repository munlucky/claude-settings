# Evidence-Driven Agent Harness - Master Plan v1

## Scope Status

Status: all-phases-complete-operational-closeout-complete

This package converts the provided final AI agent harness design into a source-local Moonshot Relay implementation plan and completed source implementation. Phase 01 created the architecture handoff that unblocked source phases, and Phases 02-10 implemented the evidence-driven harness contracts, gates, package surfaces, and plan canvas.

## Objective

Evolve Moonshot Relay into a native evidence-driven agent engineering harness where every implementation candidate is controlled by immutable contracts, source-bound evidence, independent review, deterministic verification, policy scoring, and explicit delivery gates.

The target system must not wrap or depend on external open-source harnesses as runtime authority. External systems remain reference patterns only.

## Source Inputs

| Input | Role | Status |
|---|---|---|
| Provided final design brief, `AI-Agent-하네스-최종-설계.md` | Primary architecture proposal and requirements source | consumed as source brief |
| `tools/harness-lab/harness-lab.mjs` | Existing H0 bootstrap lab gate for harness changes | available |
| `docs/public/runtime-control-plane.md` | Current runtime-state authority contract | active constraint |
| `schemas/verification.contract.yaml` | Current verification contract and read-model fields | active constraint |
| `package/package-contract.yaml` | Package/common payload and runtime profile boundary | active constraint |
| `docs/implementation/current-architecture-2026-06-09/` | Current brownfield architecture inventory | reference input |

## Non-Negotiables

- Do not treat agent chat output, skill self-report, `phase-status.yaml`, or candidate-generated reports as completion authority.
- Preserve the current Moonshot Relay authority model: `runtime-state.sqlite` remains workflow authority for run status, blockers, and whole-plan completion decisions.
- Map future `review.json`, `verify.json`, `score.json`, `submission.json`, and JSONL receipts into runtime events/eval results/completion-decision inputs; do not replace runtime-state authority without a separate ADR and migration plan.
- Do not make live `.claude`, `.codex`, account-root, or shared runtime-home adoption in early phases.
- Do not add external harnesses as runtime dependencies.
- Keep H0 `harness-lab` outside candidate authority. Candidate harness output is evidence input only.
- Use source artifacts and receipts as durable truth; SQLite remains an index/control plane, not the only reconstructable source.
- Every phase that mutates contracts, schemas, runtime-state, package payload, or delivery behavior needs targeted tests before implementation.
- Treat the source brief's Python `src/harness/`, `.harness/`, and `uv run harness` examples as conceptual target shapes. This repository's implementation target is the existing Node ESM surface: `scripts/`, `schemas/`, `tools/`, `bin/`, `skills/`, `templates/`, `tests/`, `package/`, and `docs/public/`.

## Execution Blocker

```yaml
executionBlocker:
  status: resolved_for_all_source_phases
  reason: architecture_contract_slice_and_ready_handoff_created_by_phase_01
  evidence:
    - docs/implementation/evidence-driven-agent-harness-2026-06-23/planning-loop/phase-01-waiver.yaml
    - docs/implementation/evidence-driven-agent-harness-2026-06-23/architecture-handoff/ARCHITECTURE_CONTRACT_SLICE.json
    - docs/implementation/evidence-driven-agent-harness-2026-06-23/architecture-handoff/ARCHITECTURE_HANDOFF.json
  remainingLimit:
    - Phase 10 was explicitly pulled into implementation scope on 2026-06-23 after user clarification.
    - Live account-root/profile adoption requires harness-lab, package, doctor, and profile-surface parity evidence.
```

## Accepted Independent Review Directives

```yaml
acceptedReviewDirectives:
  - id: reviewer-a-b01
    directive: "Keep this as a file-backed plan package with master, phase docs, planning-loop artifacts, and closure evidence."
    applied: true
  - id: reviewer-a-b02
    directive: "Split oversized P0 into identity/schema, ledger/state invalidation, and gate binding work."
    applied: true
  - id: reviewer-b-b01
    directive: "Do not replace current runtime-state completion authority with standalone JSON receipts."
    applied: true
  - id: reviewer-b-b03
    directive: "Define projection and compatibility between future JSONL events and current runtime_events."
    applied: true
  - id: reviewer-b-b06
    directive: "Scope implementation to the current Node ESM repository surface, not a new Python subsystem."
    applied: true
```

## Plan Package Readiness

```yaml
planPackageReadiness:
  schemaVersion: 1
  status: all-phases-complete-operational-closeout-complete
  planRoot: docs/implementation/evidence-driven-agent-harness-2026-06-23
  selectedMasterPlan: docs/implementation/evidence-driven-agent-harness-2026-06-23/00-master-plan-v1.md
  selectedPhaseDocs:
    - docs/implementation/evidence-driven-agent-harness-2026-06-23/01-architecture-contract-normalization-v1.md
    - docs/implementation/evidence-driven-agent-harness-2026-06-23/02-candidate-identity-and-artifact-schemas-v1.md
    - docs/implementation/evidence-driven-agent-harness-2026-06-23/03-contract-engine-and-spec-revision-v1.md
    - docs/implementation/evidence-driven-agent-harness-2026-06-23/04-independent-review-engine-v1.md
    - docs/implementation/evidence-driven-agent-harness-2026-06-23/05-verification-and-scoring-engine-v1.md
    - docs/implementation/evidence-driven-agent-harness-2026-06-23/06-workspace-execution-and-event-ledger-v1.md
    - docs/implementation/evidence-driven-agent-harness-2026-06-23/07-plan-graph-scheduler-and-scope-drift-v1.md
    - docs/implementation/evidence-driven-agent-harness-2026-06-23/08-delivery-submit-gate-v1.md
    - docs/implementation/evidence-driven-agent-harness-2026-06-23/09-skills-doctor-and-package-boundary-v1.md
    - docs/implementation/evidence-driven-agent-harness-2026-06-23/10-plan-canvas-ui-optional-v1.md
  reviewArtifacts:
    - docs/implementation/evidence-driven-agent-harness-2026-06-23/planning-loop/plan-quality-review-iter-01.yaml
    - docs/implementation/evidence-driven-agent-harness-2026-06-23/planning-loop/per-document-review-iter-01.yaml
  dryRunCommand: "node scripts/prepare-phase-runner-state.mjs --dry-run --json --plan-dir docs/implementation/evidence-driven-agent-harness-2026-06-23 --master-plan docs/implementation/evidence-driven-agent-harness-2026-06-23/00-master-plan-v1.md --status-file .moonshot-relay/docs/phase-status.yaml --execution-root docs/implementation/evidence-driven-agent-harness-2026-06-23/execution"
  readinessDecision: architecture_handoff_ready
```

## Phase Index

| Phase | Title | Plan File | Depends On | Execution Readiness |
|---|---|---|---|---|
| 01 | Architecture Contract and Authority Normalization | `01-architecture-contract-normalization-v1.md` | - | may run first with explicit waiver |
| 02 | Candidate Identity and Artifact Schemas | `02-candidate-identity-and-artifact-schemas-v1.md` | 01 | complete |
| 03 | Contract Engine and Spec Revision | `03-contract-engine-and-spec-revision-v1.md` | 01, 02 | complete |
| 04 | Independent Review Engine | `04-independent-review-engine-v1.md` | 02, 03 | complete |
| 05 | Verification and Scoring Engine | `05-verification-and-scoring-engine-v1.md` | 02, 04 | complete |
| 06 | Workspace, Execution, and Event Ledger | `06-workspace-execution-and-event-ledger-v1.md` | 02, 03, 05 | complete |
| 07 | Plan Graph Scheduler and Scope Drift | `07-plan-graph-scheduler-and-scope-drift-v1.md` | 03, 06 | complete |
| 08 | Delivery Submit Gate | `08-delivery-submit-gate-v1.md` | 04, 05, 06, 07 | complete |
| 09 | Skills Doctor and Package Boundary | `09-skills-doctor-and-package-boundary-v1.md` | 02, 07 | complete |
| 10 | Plan Canvas UI Optional | `10-plan-canvas-ui-optional-v1.md` | 07 | complete after explicit pull into scope |

## Source Traceability Matrix

| Req ID | Source Design Section | Requirement Summary | Phase | Acceptance Evidence |
|---|---|---|---|---|
| EDAH-REQ-01 | 1, 14, 15 | External harnesses are references only; Moonshot Relay owns native authority. | 01 | Architecture handoff records reference-only policy and no runtime dependency adoption. |
| EDAH-REQ-02 | 2.1, 2.2, 2.3 | Bind review, verify, score, submit, and close to candidate identity and exact source digests. | 02 | Schema and unit tests reject mismatched candidate/source digests. |
| EDAH-REQ-03 | 4.1, 5 | Add contract/spec revision engine and invalidation rules. | 03 | Contract tests prove spec/done/plan/source/policy changes invalidate downstream evidence. |
| EDAH-REQ-04 | 2.4, 4.5 | Enforce fresh-context independent review bundles. | 04 | Review bundle tests exclude implementation transcript and require candidate_id. |
| EDAH-REQ-05 | 4.6, 4.7 | Deterministic verification and policy scoring produce `verify.json` and `score.json`. | 05 | Verify/score tests require command evidence, env digest, hard gates, and policy version. |
| EDAH-REQ-06 | 4.3, 4.4, 4.9 | Worktree lease, run receipts, event ledger, and resume reconstruct task state. | 06 | Event-ledger hash-chain and resume tests pass after SQLite index deletion. |
| EDAH-REQ-07 | 4.2, P3 | Plan graph scheduler enforces dependencies, write-set conflicts, and scope drift. | 07 | Scheduler tests block overlapping write sets and out-of-scope actual changes. |
| EDAH-REQ-08 | 4.8 | Delivery gate blocks submit/close unless candidate evidence and source SHA align. | 08 | Delivery tests block mismatched SHA and non-FULL candidates. |
| EDAH-REQ-09 | 2.1, 3.3, 4.9 | New JSON receipts and JSONL event artifacts must project into current runtime-state authority instead of competing with it. | 01, 05, 06 | Tests prove runtime-state accepted completion is still required for whole-plan closeout. |
| EDAH-REQ-10 | 4.10 | Skills supply-chain doctor detects lock, hash, license, and permission drift. | 09 | Doctor tests detect missing skills lock and content hash drift without expanding public runtime surface. |
| EDAH-REQ-11 | 4.11 | Plan review canvas is optional derived UI, not source truth. | 10 | Render tests prove generated HTML/feedback artifacts do not replace Markdown/YAML source. |

## Phase 01 Waiver Contract

Phase 01 may run before a ready handoff only when all of the following are true:

```yaml
phase01Waiver:
  artifactPath: "docs/implementation/evidence-driven-agent-harness-2026-06-23/planning-loop/phase-01-waiver.yaml"
  requiredFields:
    - waiverId
    - approver
    - reviewedBy
    - allowedPhase: "01"
    - ownedPaths
    - readOnlyPaths
    - verificationSignals
    - expiresAfter
  allowedOwnedPaths:
    - "docs/implementation/evidence-driven-agent-harness-2026-06-23/architecture-handoff/**"
    - "docs/implementation/evidence-driven-agent-harness-2026-06-23/planning-loop/**"
  forbiddenActions:
    - "source code mutation outside docs/implementation/evidence-driven-agent-harness-2026-06-23/**"
    - "live account-root/profile mutation"
    - "runtime-state completion claim"
```

Without this waiver artifact, Phase 01 remains preparation-only.

## Expected Architecture Handoff Paths

```yaml
architectureHandoff:
  packageRoot: "docs/implementation/evidence-driven-agent-harness-2026-06-23/architecture-handoff"
  requiredPaths:
    - "docs/implementation/evidence-driven-agent-harness-2026-06-23/architecture-handoff/TRACEABILITY_MATRIX.md"
    - "docs/implementation/evidence-driven-agent-harness-2026-06-23/architecture-handoff/ARCHITECTURE_REVIEW.md"
    - "docs/implementation/evidence-driven-agent-harness-2026-06-23/architecture-handoff/ARCHITECTURE_CONTRACT_SLICE.json"
    - "docs/implementation/evidence-driven-agent-harness-2026-06-23/architecture-handoff/ARCHITECTURE_HANDOFF.json"
    - "docs/implementation/evidence-driven-agent-harness-2026-06-23/architecture-handoff/ADR/ADR-001-runtime-state-authority.md"
  requiredHandoffMetadata:
    - status
    - selectedDecisionIds
    - selectedConstraintIds
    - ownedPaths
    - readOnlyPaths
    - verificationSignalIds
  compatibilityPlacement:
    stagedPaths: "ARCHITECTURE_CONTRACT_SLICE.pathBoundaries.stagedPaths"
    blockingPreconditions: "ARCHITECTURE_HANDOFF.blocking, errors, readBeforeRetry, and promptBlock"
```

## Invalidation Matrix

| Change | Required Event / Artifact | Invalidates |
|---|---|---|
| `spec.yaml`, `done.yaml`, or design source changes | `contract.revision.created` | plan, run receipts, review, verify, score, submission |
| `plan.yaml` or rendered phase plan changes | `plan.revision.created` | run receipts, review, verify, score, submission |
| source tree changes after review | `candidate.source.changed` | review, verify, score, submission |
| lockfile/toolchain/environment digest changes | `candidate.environment.changed` | baseline, verify, score, submission |
| policy/scoring rule changes | `policy.revision.created` | score, submission |
| autofix from review finding | `candidate.rebased` or `candidate.autofix.created` | review, verify, score, submission |

## Adoption Strategy

| Stage | Target | Policy |
|---|---|---|
| Planning | `docs/implementation/**` only | Parent session owns edits; independent agents provide sidecar reviews. |
| Phase 01 | Architecture package and contracts | Source-only. No runtime profile mutation. |
| Phases 02-07 | Harness kernel source | Canonical source and tests only. Package/live install deferred. |
| Phase 08 | Package/delivery/UI boundaries | Package payload may change with tests. Live account-root sync requires explicit approval. |

## Review Loop Contract

- First pass uses two independent reviewers.
- Parent session applies accepted edits only.
- Every phase document receives a document-level review entry in `planning-loop/per-document-review-iter-01.yaml`.
- Any blocker after re-review keeps the package `blocked`.

## Final Validation Gate

Before any future execution closeout:

- `npm run test:lab`
- `npm test`
- `npm run test:package`
- `npm run test:eval`
- `node package/build-package.mjs --runtime all --dry-run --json`
- targeted schema/contract tests introduced by each phase
- runtime-state accepted completion only when a whole-plan execution closeout is explicitly requested

## Completion Rule

This package is complete when all phase source artifacts exist, reviews are recorded, phase-local scorecard/QA/handoff evidence exists, runner projection reports no active phase, and final validation gates pass. Operational account-root closeout additionally requires doctor pass and live service profile surface parity with `package/runtime-surface.json`.

## Implementation Closeout

Status: all-phases-complete

Completed phases:
- Phase 01 through Phase 10 have phase-local scorecard, QA report, handoff, and closeout evidence.

Out of scope:
- Further live account-root/profile adoption after this closeout requires fresh harness-lab, doctor, package, and profile-surface parity evidence.

Current runner projection:
- `activeExecutionStatus=all_phases_projected_complete`
- `activePhaseDoc=""`
- Phase 10 status is projected as `complete`.

Operational closeout:
- `skills.lock.json` is tracked as the canonical skill supply-chain lock.
- `node scripts/doctor.mjs check --json` returns `status=pass`.
- `npm run test:lab` passed with `runId=harness-lab-20260623-101647` and `promotable=true`.
- Account-root install `installId=20260623-101724` completed after lab pass.
- Installed profile verification reported no missing or mismatched files for `moonshot-relay`, `claude`, or `codex`.
- Live Codex canonical skill surface has `extraCanonicalCount=0` against `package/runtime-surface.json`.
