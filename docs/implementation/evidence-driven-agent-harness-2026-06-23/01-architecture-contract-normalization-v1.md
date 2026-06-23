# Phase 01 - Architecture Contract and Authority Normalization v1

## Objective

Turn the standalone final harness design into a compact architecture contract package and settle the authority model before any implementation phase starts.

The required authority decision for this repository is hybrid-extension, not replacement:

```text
review.json / verify.json / score.json / submission.json / JSONL receipts
  -> structured evidence and replay artifacts
  -> runtime_events / eval_results / verification-plane evidence
  -> runtime-state completion_decisions remains whole-plan authority
```

## Dependencies

- None.

## Owned Paths

- `docs/implementation/evidence-driven-agent-harness-2026-06-23/**`
- `docs/implementation/evidence-driven-agent-harness-2026-06-23/architecture-handoff/TRACEABILITY_MATRIX.md`
- `docs/implementation/evidence-driven-agent-harness-2026-06-23/architecture-handoff/ARCHITECTURE_REVIEW.md`
- `docs/implementation/evidence-driven-agent-harness-2026-06-23/architecture-handoff/ARCHITECTURE_CONTRACT_SLICE.json`
- `docs/implementation/evidence-driven-agent-harness-2026-06-23/architecture-handoff/ARCHITECTURE_HANDOFF.json`
- `docs/implementation/evidence-driven-agent-harness-2026-06-23/architecture-handoff/ADR/`

## Read-only Paths

- `docs/implementation/current-architecture-2026-06-09/**`
- `docs/public/runtime-control-plane.md`
- `docs/public/repository-layout.md`
- `package/package-contract.yaml`
- `tools/harness-lab/harness-lab.mjs`

## Staged Paths

- `docs/implementation/evidence-driven-agent-harness-2026-06-23/`

## Live Mutation Policy

No live profile, account-root, runtime DB, MemoryGraph, or package adoption mutation.

## Work Items

| ID | Work Item | Output |
|---|---|---|
| P01-1 | Extract stable decisions, constraints, and non-negotiables from the source brief. | Architecture decision inventory |
| P01-2 | Map target architecture to existing Moonshot Relay modules and gaps. | Impact map |
| P01-3 | Produce or request `ARCHITECTURE_CONTRACT_SLICE` / `ARCHITECTURE_HANDOFF`. | Ready/blocked handoff |
| P01-4 | Record JSON receipt and JSONL event projection rules into the current runtime-state authority model. | `ADR-001-runtime-state-authority.md` |
| P01-5 | Mark which later phases can execute only after handoff readiness. | Updated readiness metadata |

## Acceptance Criteria

- Architecture contract explicitly preserves reference-only external harness policy.
- The plan explicitly states that runtime-state remains authority for run status, blockers, and whole-plan completion.
- JSON artifacts are defined as evidence/replay inputs, not standalone completion authority.
- Each later phase has selected requirements, owned paths, read-only paths, and verification signals.
- `ARCHITECTURE_HANDOFF.json` includes status, selected decision IDs, selected constraint IDs, owned/read-only/staged paths, verification signal IDs, and blocking preconditions.
- Missing handoff remains a blocker rather than being hidden as execution-ready.
- H0 `harness-lab` is recorded as a pre-implementation safety gate.

## Verification Signals

- `rg -n "ARCHITECTURE_HANDOFF|candidate_id|harness-lab|runtime-state|completion_decisions" docs/implementation/evidence-driven-agent-harness-2026-06-23`
- Architecture artifact validation command if `moonshot-architecture` produces a formal package.

## Review-Improvement Loop

- Review focus: ambiguity, missing architecture handoff fields, over-broad phase scope.
- Required reviewers: Independent Reviewer A and Independent Reviewer B.
- Parent accepted edits are recorded in `planning-loop/per-document-review-iter-01.yaml`.

## Phase 01 Closeout

Status: complete

Completion evidence:

- `planning-loop/phase-01-waiver.yaml`
- `architecture-handoff/TRACEABILITY_MATRIX.md`
- `architecture-handoff/ARCHITECTURE_REVIEW.md`
- `architecture-handoff/ARCHITECTURE_CONTRACT_SLICE.json`
- `architecture-handoff/ARCHITECTURE_HANDOFF.json`
- `architecture-handoff/ADR/ADR-001-runtime-state-authority.md`
- `execution/phase-01/SCORECARD.md`
- `execution/phase-01/QA_REPORT.md`
- `execution/phase-01/HANDOFF.md`

Execution decision:

- Phase 02-09 source implementation may proceed through `moonshot-phase-runner` using the ready handoff.
- Phase 10 remains optional backlog unless explicitly pulled into scope.
- Live account-root/profile adoption remains blocked without explicit approval.
