# Phase 06: Commit Closeout Preflight And Regression Sync (v1)

## Source Mapping

| Req ID | Source Section | Requirement Summary | This Phase Handling |
|---|---|---|---|
| NWFP-008 | User improvement units | Commit closeout preflights Git index writes, ignored evidence, deny patterns, MemoryGraph state, and HEAD | Add closeout preflight and regression sync |
| NWFP-010 | Prior waste baseline | MemoryGraph transport failures do not block workflow closeout | Preserve non-blocking MemoryGraph unavailable semantics |
| NWFP-006 | User improvement units | Status rebuild and normalized root state must be documented | Sync docs and verification contract references |

## Goal

- Make final closeout predictable and ensure the full nonwork-failure prevention package is covered by regression checks and docs.

## Expected Outcome

- Git index permission, ignored verdict artifacts, deny-pattern staging, MemoryGraph unavailable, and HEAD drift are detected before commit or final response.
- New phase runner behavior is documented and covered by verification contract/checks.

## Phase Execution Metadata

```yaml
phaseExecution:
  schemaVersion: 1
  parallelEligible: false
  parallelGroup: "closeout"
  dependsOn:
    - "01"
    - "02"
    - "03"
    - "04"
    - "05"
  conflictsWith: []
  ownedPaths:
    - ".claude/scripts/phase-final-git-closeout.mjs"
    - ".claude/scripts/phase-checkpoint-commit.mjs"
    - ".claude/scripts/commit-moonshot-memory-refresh.mjs"
    - ".claude/scripts/moonshot-phase-dispatch.mjs"
    - ".claude/verification.contract.yaml"
    - ".claude/docs/guidelines/"
    - ".claude/docs/reference/"
    - "docs/implementation/harness-nonwork-failure-prevention-2026-05-07/"
  readOnlyPaths:
    - ".claude/scripts/phase-capability-preflight.mjs"
    - ".claude/scripts/verification-verdict-state.mjs"
    - ".claude/scripts/agent-loop-phase-state.mjs"
    - ".claude/scripts/verify-phase-runtime-parity.sh"
  sharedMutablePaths:
    - ".claude/verification.contract.yaml"
  requiresManualEvidence: false
  mergePolicy: "sequential_closeout"
```

## Scope

- Included:
  - Add `phase-final-git-closeout.mjs preflight` or equivalent preflight mode.
  - Probe Git index write capability before staging/commit.
  - Detect ignored evidence that must be included with `git add -f` while preserving deny-pattern exclusions.
  - Record MemoryGraph unavailable as `promotion_write_unavailable` or non-blocking closeout warning unless strict memory validation applies.
  - Re-read `HEAD` after commit and before final closeout reporting.
  - Update docs and verification contract for new commands/schema where needed.
- Excluded:
  - Automatically pushing commits or creating PRs.
  - Making MemoryGraph direct write mandatory.
  - Rewriting prior implementation package closeout artifacts.

## Preconditions And Inputs

- Phases 01-05 are complete.
- Required current code:
  - `.claude/scripts/phase-final-git-closeout.mjs`
  - `.claude/scripts/phase-checkpoint-commit.mjs`
  - `.claude/scripts/commit-moonshot-memory-refresh.mjs`
  - `.claude/scripts/moonshot-phase-dispatch.mjs`
  - `.claude/verification.contract.yaml`

## Detailed Tasks

| ID | Task | Steps | Done Criteria |
|---|---|---|---|
| P06-1 | Add Git closeout preflight | Check index lock/write probe, ignored evidence, deny patterns, worktree dirtiness, and incomplete phase artifacts | Preflight reports exact next action before commit |
| P06-2 | Harden checkpoint commit | Use preflight output to stage valid ignored evidence with force when required and block denied runtime/cache paths | Commit code cannot silently omit required evidence |
| P06-3 | Separate MemoryGraph unavailable | Record MemoryGraph direct/MCP unavailable as non-blocking closeout status unless strict mode requested | MemoryGraph failure does not change phase pass/fail |
| P06-4 | Pin HEAD reporting | Re-read `HEAD` after commit and final closeout; report stable commit id even if follow-up operations occur | Final closeout has fixed commit metadata |
| P06-5 | Sync docs and regression contract | Update verification contract/guidelines with new commands and run full regression set | Knowledge audit passes |

## Exact Execution Targets

| ID | Create Files | Modify Files | Test Files | Command | Expected Fail/Pass Signal |
|---|---|---|---|---|---|
| P06-1 | none | `.claude/scripts/phase-final-git-closeout.mjs` | self-test in same file | `node .claude/scripts/phase-final-git-closeout.mjs self-test` | Self-test covers clean, dirty, ignored evidence, denied staging, git failure |
| P06-2 | none | `.claude/scripts/phase-checkpoint-commit.mjs` | self-test in same file | `node .claude/scripts/phase-checkpoint-commit.mjs self-test` | Commit fixture passes and denied paths are excluded |
| P06-3 | none | `.claude/scripts/commit-moonshot-memory-refresh.mjs` | none | `node .claude/scripts/commit-moonshot-memory-refresh.mjs --mcp-status skipped --json` | JSON reports non-blocking direct status/log path |
| P06-4 | none | `.claude/scripts/moonshot-phase-dispatch.mjs` | boundary verifier | `node --check .claude/scripts/moonshot-phase-dispatch.mjs` | Exit 0 |
| P06-5 | docs as needed | `.claude/verification.contract.yaml`, docs guidelines/reference | repository audit | `bash .claude/scripts/knowledge-repo-audit.sh` | Audit passes |

## Critical Product Scenarios

| Scenario | User-visible Expectation | Command That Proves It | Expected Pass Signal | Evidence Path |
|---|---|---|---|---|
| SCN-P06-1 | Git index denied is caught before expensive final closeout | `node .claude/scripts/phase-final-git-closeout.mjs self-test` | fixture reports Git write blocker | `QA_REPORT.md` self-test output |
| SCN-P06-2 | Ignored verification evidence is not silently omitted | `node .claude/scripts/phase-final-git-closeout.mjs self-test` | fixture identifies force-add evidence and deny-pattern exclusions | `QA_REPORT.md` self-test output |
| SCN-P06-3 | MemoryGraph unavailable does not fail phase completion | `node .claude/scripts/commit-moonshot-memory-refresh.mjs --mcp-status skipped --json` | JSON emits unavailable/direct status without strict failure | `QA_REPORT.md` command output |
| SCN-P06-4 | Final report references stable post-commit HEAD | `node .claude/scripts/phase-checkpoint-commit.mjs self-test` | commit fixture records actual HEAD | `QA_REPORT.md` self-test output |
| SCN-P06-5 | Full harness regression still passes | `bash .claude/scripts/verify-phase-runner-boundary.sh` | Boundary verifier passes | `QA_REPORT.md` regression section |

## Blockers And Review

- Blocker condition: Closeout preflight can stage runtime/cache/private paths, or MemoryGraph unavailable changes phase completion semantics.
- First review checkpoint: Review staging allow/deny policy before modifying commit scripts.
- Re-review trigger: Any change to `.claude/verification.contract.yaml`, deny-pattern staging, or final dispatch return semantics.
- Verification evidence path: `docs/implementation/harness-nonwork-failure-prevention-2026-05-07/execution/06-phase-06-commit-closeout-preflight-and-regression-sync-v1/QA_REPORT.md`

## Verification Plan

- [ ] Syntax: `node --check .claude/scripts/phase-final-git-closeout.mjs && node --check .claude/scripts/phase-checkpoint-commit.mjs && node --check .claude/scripts/commit-moonshot-memory-refresh.mjs && node --check .claude/scripts/moonshot-phase-dispatch.mjs`
- [ ] Closeout self-tests: `node .claude/scripts/phase-final-git-closeout.mjs self-test && node .claude/scripts/phase-checkpoint-commit.mjs self-test`
- [ ] MemoryGraph unavailable smoke: `node .claude/scripts/commit-moonshot-memory-refresh.mjs --mcp-status skipped --json`
- [ ] Boundary regression: `bash .claude/scripts/verify-phase-runner-boundary.sh`
- [ ] Runtime parity regression: `bash .claude/scripts/verify-phase-runtime-parity.sh .claude/docs/runtime-parity-reference-plan`
- [ ] Repository audit: `bash .claude/scripts/knowledge-repo-audit.sh`

## Completion Evidence

- Closeout self-test output.
- MemoryGraph unavailable JSON output.
- Boundary and runtime parity verifier output.
- Knowledge audit artifact path.

## Deliverables

- Commit closeout preflight.
- Ignored evidence and deny-pattern staging guard.
- Non-blocking MemoryGraph unavailable closeout status.
- Documentation and verification contract sync.

## Phase Completion Checklist

- [ ] Git and ignored-evidence preflight is implemented and tested.
- [ ] MemoryGraph unavailable is non-blocking by default and visible in evidence.
- [ ] HEAD is re-read after commit/final closeout.
- [ ] Docs and verification contract are synchronized.
- [ ] Full regression/audit command set passes or any environment blocker is classified by Phase 01 taxonomy.

## Handoff Notes

- After Phase 06, update this master checklist with checked phases and cite execution artifacts in the final closeout.
