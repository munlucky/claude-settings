# Phase 01: Environment Preflight And Failure Taxonomy (v1)

## Source Mapping

| Req ID | Source Section | Requirement Summary | This Phase Handling |
|---|---|---|---|
| NWFP-001 | User failure inventory | Codex session/storage/state DB permission failures are preflighted and classified | Add Codex storage and state probes to preflight output |
| NWFP-002 | User failure inventory | shell snapshot, MCP cleanup, PATH/plugin/network sync noise is summarized | Add stable failure codes and warning classes |
| NWFP-003 | User improvement units | Node/Bash/Git/rg/MemoryGraph capability probes run before expensive work | Extend capability matrix and tests |
| NWFP-010 | Waste baseline | Deprecated warnings and MemoryGraph transport failures stay out of phase semantics | Classify as nonwork warning/blocker, not implementation failure |

## Goal

- Expand the preflight and taxonomy layer so recurring nonwork failures are detected before worker launch.

## Expected Outcome

- `node .claude/scripts/phase-capability-preflight.mjs --json` emits stable current blockers, warning classes, fallback hints, and fingerprints for the listed nonwork failures.
- `failure-classifier` can classify every user-listed environment/runtime/storage failure without returning `unknown_failure`.

## Phase Execution Metadata

```yaml
phaseExecution:
  schemaVersion: 1
  parallelEligible: false
  parallelGroup: "wave-1"
  dependsOn: []
  conflictsWith:
    - "02"
  ownedPaths:
    - ".claude/scripts/lib/failure-classifier.mjs"
    - ".claude/scripts/lib/failure-classifier.test.mjs"
    - ".claude/scripts/phase-capability-preflight.mjs"
  readOnlyPaths:
    - ".claude/scripts/runtime-cli.mjs"
    - ".claude/scripts/memorygraph-direct.mjs"
    - ".claude/verification.contract.yaml"
    - "docs/implementation/harness-reliability-retro-2026-05-05/ISSUE_REGISTER.md"
  sharedMutablePaths: []
  requiresManualEvidence: false
  mergePolicy: "sequential_shared_harness"
```

## Scope

- Included:
  - Add failure codes for Codex session/storage/state DB readonly, shell snapshot failures, MCP cleanup EPERM, PATH update denied, plugin/network sync failure, Node spawn EPERM, Bash/Git/rg access denied, MemoryGraph unavailable, verifier unavailable, and spawn blocked.
  - Add preflight probes for Node child spawn, Bash smoke, Git index write probe, `rg` path sanity, Codex home/session storage writability, Codex state DB access mode, shell snapshot directory, and MemoryGraph direct health.
  - Preserve existing Docker/package-manager capability behavior.
- Excluded:
  - Changing worker retry policy.
  - Rewriting phase status, verdict schema, runtime parity, or commit closeout behavior.

## Preconditions And Inputs

- Required docs:
  - `docs/implementation/harness-nonwork-failure-prevention-2026-05-07/00-master-plan-v1.md`
  - `docs/implementation/harness-reliability-retro-2026-05-05/ISSUE_REGISTER.md`
- Required current code:
  - `.claude/scripts/phase-capability-preflight.mjs`
  - `.claude/scripts/lib/failure-classifier.mjs`
  - `.claude/scripts/lib/failure-classifier.test.mjs`

## Detailed Tasks

| ID | Task | Steps | Done Criteria |
|---|---|---|---|
| P01-1 | Extend failure taxonomy | Add stable definitions, regex patterns, retry policies, fallback hints, and `isEnvironmentBlockerCode` coverage | Every user-listed nonwork failure class maps to a non-unknown code |
| P01-2 | Add preflight probes | Add isolated probes that do not mutate tracked files; write temp probe files only under ignored/temp paths | JSON includes `currentBlockers`, `failureClassCounts`, and per-probe details |
| P01-3 | Add classifier fixtures | Add test cases for Codex permission denied, readonly DB, shell snapshot, MCP cleanup, Node EPERM, Git index denied, MemoryGraph transport closed | `node --test .claude/scripts/lib/failure-classifier.test.mjs` passes |
| P01-4 | Preserve fallback semantics | Keep `rg` fallback to Select-String on Windows and network fetch as cache/offline fallback | Existing resolver tests remain compatible |

## Exact Execution Targets

| ID | Create Files | Modify Files | Test Files | Command | Expected Fail/Pass Signal |
|---|---|---|---|---|---|
| P01-1 | none | `.claude/scripts/lib/failure-classifier.mjs` | `.claude/scripts/lib/failure-classifier.test.mjs` | `node --test .claude/scripts/lib/failure-classifier.test.mjs` | RED before taxonomy additions; GREEN with all nonwork codes covered |
| P01-2 | none | `.claude/scripts/phase-capability-preflight.mjs` | none | `node .claude/scripts/phase-capability-preflight.mjs --json` | JSON prints `schemaVersion`, `status`, `decision`, `currentBlockers`, `capabilities` |
| P01-3 | none | `.claude/scripts/lib/failure-classifier.test.mjs` | same | `node --check .claude/scripts/phase-capability-preflight.mjs && node --check .claude/scripts/lib/failure-classifier.mjs` | Exit 0 |

## Critical Product Scenarios

| Scenario | User-visible Expectation | Command That Proves It | Expected Pass Signal | Evidence Path |
|---|---|---|---|---|
| SCN-P01-1 | Operator sees Codex storage denied as environment blocker before worker launch | `node .claude/scripts/phase-capability-preflight.mjs --json` | `decision` is not an implementation retry reason; blocker code is stable | `.claude/logs/agent-loop/capabilities-*.json` |
| SCN-P01-2 | Repeated MemoryGraph `Transport closed` is not reported as product verification failure | `node --test .claude/scripts/lib/failure-classifier.test.mjs` | fixture maps to `memorygraph_unavailable` | test output captured in `QA_REPORT.md` |
| SCN-P01-3 | Git index write denial is distinct from Git command missing | `node --test .claude/scripts/lib/failure-classifier.test.mjs` | fixture maps to `git_index_denied` or `git_eperm` as appropriate | test output captured in `QA_REPORT.md` |

## Blockers And Review

- Blocker condition: A user-listed nonwork failure still normalizes to `unknown_failure`, or preflight writes tracked files during probes.
- First review checkpoint: Review taxonomy names and retry policies before wiring them into runner behavior.
- Re-review trigger: Any new failure code changes `decision`, `retryPolicy`, or fallback semantics after runner integration starts.
- Verification evidence path: `docs/implementation/harness-nonwork-failure-prevention-2026-05-07/execution/01-phase-01-environment-preflight-and-failure-taxonomy-v1/QA_REPORT.md`

## Verification Plan

- [ ] Syntax: `node --check .claude/scripts/phase-capability-preflight.mjs && node --check .claude/scripts/lib/failure-classifier.mjs`
- [ ] Unit: `node --test .claude/scripts/lib/failure-classifier.test.mjs`
- [ ] Runtime smoke: `node .claude/scripts/phase-capability-preflight.mjs --json`

## Completion Evidence

- `phase-capability-preflight` JSON artifact path.
- `node --test` output for classifier fixtures.
- Diff summary for changed classifier and preflight files.

## Deliverables

- Expanded failure taxonomy.
- Expanded capability preflight JSON schema.
- Regression fixtures for the user-listed nonwork failures.

## Phase Completion Checklist

- [ ] Every listed nonwork failure has stable classification.
- [ ] Preflight emits actionable blocker/fallback metadata.
- [ ] Existing capability behavior is preserved.
- [ ] Verification commands pass or environment blockers are classified by the new taxonomy.

## Handoff Notes

- Phase 02 must use the new classifier decisions to suppress worker auto-fix loops for environment failures.
