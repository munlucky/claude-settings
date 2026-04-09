# Resumable Session Layer Master Plan v1

> Phase-based execution package for resumable task state and harness telemetry improvements.

## Source Baseline

- `.claude/docs/tasks/resumable-session-layer/work-plan.md` (role: scope and sequencing)
- `.claude/docs/tasks/resumable-session-layer/ASSUMPTIONS.md` (role: planning assumptions)
- `.claude/skills/moonshot-phase-runner/SKILL.md` (role: execution contract)

## Objective

- add a minimal session layer that makes interrupted work resumable and produces structured execution data for harness recursive improvement

## Phase Index

| Phase | Title | Plan File | Depends On |
|------|-------|-----------|------------|
| 01 | Resume Contract And State Model | `.claude/docs/tasks/resumable-session-layer/implementation/01-resume-contract-and-state-model-v1.md` | - |
| 02 | Event Telemetry And Artifact Linkage | `.claude/docs/tasks/resumable-session-layer/implementation/02-event-telemetry-and-artifact-linkage-v1.md` | 01 |
| 03 | Harness Integration And Recovery Proof | `.claude/docs/tasks/resumable-session-layer/implementation/03-harness-integration-and-recovery-proof-v1.md` | 02 |

## Execution Order Notes

- phase 01 freezes the naming and state contract before any instrumentation is designed
- phase 02 must build on phase-01 ids and state semantics
- phase 03 may propose implementation hooks, but must stay bounded to harness-owned files and examples

## Source Traceability Matrix

| Req ID | Source | Requirement Summary | Phase | Plan File | Status |
|--------|--------|---------------------|-------|-----------|--------|
| REQ-SL-1 | work-plan Core Requirements | snapshot file exposes resumable current state | 01 | `.claude/docs/tasks/resumable-session-layer/implementation/01-resume-contract-and-state-model-v1.md` | mapped |
| REQ-SL-2 | work-plan Core Requirements | append-only events with stable ids | 02 | `.claude/docs/tasks/resumable-session-layer/implementation/02-event-telemetry-and-artifact-linkage-v1.md` | mapped |
| REQ-SL-3 | work-plan Core Requirements | task/session/run/event/decision identity model | 01 | `.claude/docs/tasks/resumable-session-layer/implementation/01-resume-contract-and-state-model-v1.md` | mapped |
| REQ-SL-4 | work-plan Core Requirements | failure and retry states are first-class | 01 | `.claude/docs/tasks/resumable-session-layer/implementation/01-resume-contract-and-state-model-v1.md` | mapped |
| REQ-SL-5 | work-plan Core Requirements | decision reason and impact support resume-time reconstruction | 02 | `.claude/docs/tasks/resumable-session-layer/implementation/02-event-telemetry-and-artifact-linkage-v1.md` | mapped |
| REQ-SL-6 | work-plan Core Requirements | artifacts link back to creating/updating events | 02 | `.claude/docs/tasks/resumable-session-layer/implementation/02-event-telemetry-and-artifact-linkage-v1.md` | mapped |
| REQ-SL-7 | work-plan Core Requirements | minimum telemetry for harness recursive improvement | 02 | `.claude/docs/tasks/resumable-session-layer/implementation/02-event-telemetry-and-artifact-linkage-v1.md` | mapped |
| REQ-SL-8 | work-plan Core Requirements | session layer complements existing docs and skills | 03 | `.claude/docs/tasks/resumable-session-layer/implementation/03-harness-integration-and-recovery-proof-v1.md` | mapped |
| SCN-SL-1 | work-plan Critical Scenarios | interruption and resume without full chat replay | 03 | `.claude/docs/tasks/resumable-session-layer/implementation/03-harness-integration-and-recovery-proof-v1.md` | mapped |
| SCN-SL-2 | work-plan Critical Scenarios | repeated failure pattern becomes harness input | 02 | `.claude/docs/tasks/resumable-session-layer/implementation/02-event-telemetry-and-artifact-linkage-v1.md` | mapped |
| SCN-SL-3 | work-plan Critical Scenarios | human understands stop reason and next action quickly | 03 | `.claude/docs/tasks/resumable-session-layer/implementation/03-harness-integration-and-recovery-proof-v1.md` | mapped |

## Unmapped Source Requirements

- none

## Phase Completion Checklist

- [x] Phase 01 - Resume Contract And State Model
- [x] Phase 02 - Event Telemetry And Artifact Linkage
- [x] Phase 03 - Harness Integration And Recovery Proof

## Completion Rule

- mark a phase complete only when its documented exit criteria, review evidence, and execution closeout artifacts are all aligned
- do not start instrumentation planning before the identity and state model are frozen
- do not declare the initiative complete until the sample interruption/resume proof exists

## Initiative Artifacts

- phase status: `.claude/docs/tasks/resumable-session-layer/phase-status.yaml`
- phase runner result: `.claude/docs/tasks/resumable-session-layer/phase-runner-result.yaml`
- sample recovery package: `.claude/docs/tasks/resumable-session-layer/samples/phase03-recovery/`
