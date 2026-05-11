# Phase 07: Artifact Projection Guard (v1)

## Source Mapping
| Req ID | AC ID | Source Section | Requirement Summary | This Phase Handling |
|--------|-------|----------------|---------------------|---------------------|
| REQ-1.11 | AC-11 | Plan v10 / Artifact Projection Guard | Reject `Log: none`, generated stale phase tokens, and unstable WORKSETS rewrites. | Harden projection writer and closeout gate. |

## Goal
- Stop artifact projection from reintroducing stale blocker/current contradictions after the closeout source-of-truth is fixed.

## Expected Outcome
- `agent-loop-phase-artifacts.mjs` cannot publish final/blocked artifacts without an active log path.
- Generated stale tokens such as `out_of_scope_for_phase_03` fail current publish for other phases.
- WORKSETS rendering is deterministic for known `atomicTasks[]` fields.

## Phase Execution Metadata
```yaml
phaseExecution:
  schemaVersion: 1
  parallelEligible: false
  parallelGroup: "wave-5"
  dependsOn: ["03", "04", "05"]
  conflictsWith: ["08"]
  ownedPaths:
    - ".claude/scripts/agent-loop-phase-artifacts.mjs"
    - ".claude/scripts/phase-closeout-finalize.mjs"
    - ".claude/scripts/lib/harness-state-invariants.mjs"
    - ".claude/scripts/lib/harness-state-invariants.test.mjs"
  readOnlyPaths:
    - ".claude/scripts/lib/current-artifacts-state.mjs"
    - ".claude/tests/fixtures/phase-closeout/phase-08-success/**"
  sharedMutablePaths:
    - ".claude/scripts/phase-closeout-finalize.mjs"
  requiresManualEvidence: false
  mergePolicy: "sequential_projection_gate"
```

## Scope
- Included:
  - `Log: none` hard gate.
  - Projection residue lint for generated stale phase tokens.
  - WORKSETS known-field deterministic emitter.
  - `complete_with_environment_blocker` invariant semantics.
- Excluded:
  - Full YAML roundtrip parser.
  - Free-form history mention ban.

## Detailed Tasks
| ID | Task | Steps | Done Criteria |
|----|------|-------|---------------|
| P07-1 | Add invariant module | Create `harness-state-invariants.mjs` with current publish conditions and environment blocker semantics. | Complete, blocked, failed, superseded, and environment blocker combinations are tested. |
| P07-2 | Require active log path | Remove final/blocked publish fallback that writes `Log: none`. | Missing log path blocks publish. |
| P07-3 | Add stale token lint | Reject generated tokens like `out_of_scope_for_phase_03` and `phase_03` outside matching phase. | Free-form `Phase 03에서 이관된 항목` remains allowed. |
| P07-4 | Stabilize WORKSETS emitter | Render known `atomicTasks[]` fields deterministically and preserve unknown top-level blocks. | Idempotence test passes. |

## Exact Execution Targets
| ID | Create Files | Modify Files | Test Files | Command | Expected Fail/Pass Signal |
|----|--------------|--------------|------------|---------|---------------------------|
| P07-1 | `.claude/scripts/lib/harness-state-invariants.mjs` | `.claude/scripts/phase-closeout-finalize.mjs` | `.claude/scripts/lib/harness-state-invariants.test.mjs` | `node --test .claude/scripts/lib/harness-state-invariants.test.mjs` | invalid state combinations fail. |
| P07-2 | none | `.claude/scripts/agent-loop-phase-artifacts.mjs` | artifact projection tests | `node --test .claude/scripts/*.test.mjs` | `Log: none` publish case fails. |
| P07-4 | none | `.claude/scripts/agent-loop-phase-artifacts.mjs` | WORKSETS idempotence test | `node --test .claude/scripts/*.test.mjs` | WORKSETS output stable. |

## Critical Product Scenarios
| Scenario | User-visible Expectation | Proof Command | Expected Pass Signal | Evidence Path |
|----------|--------------------------|---------------|----------------------|---------------|
| SCN-12 | A completed phase cannot cite `Log: none`. | artifact projection test | missing log case fails. | test output |
| SCN-13 | Stale generated phase residue cannot become current evidence. | stale token lint test | generated stale token rejected. | test output |

## Blockers And Review
- Blocker condition: implementation attempts to add a generic YAML parser or ban all free-form phase mentions.
- First review checkpoint: invariant module schema review.
- Verification evidence path: invariant and projection tests.

## Validation Plan
- [ ] `node --test .claude/scripts/lib/harness-state-invariants.test.mjs`
- [ ] `node --test .claude/scripts/*.test.mjs`
- [ ] fixture-backed dry-run command

## Deliverables
- Invariant module.
- Hardened artifact projection.
- WORKSETS deterministic emitter behavior.

## Phase Completion Checklist
- [ ] `Log: none` cannot publish.
- [ ] Generated stale phase tokens fail.
- [ ] WORKSETS emitter is idempotent.
