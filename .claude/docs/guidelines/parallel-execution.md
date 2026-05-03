# Parallel Execution Guidelines

## Core Rule
- Do not run plan validation and implementation in parallel.
- `codex-validate-plan` must finish before `implementation-runner`.

## Trigger Conditions
- Planning artifacts are finalized (`agreement.md`, `context.md`).
- If `karpathy-execution-gate` is in the chain, it is passed.
- Task has independent post-implementation stages.

## Parallelization Strategy
Only parallelize independent stages that do not define implementation scope.

Exception: the delegated-terminal phase runner may automatically run phase-level waves in parallel when `phase-parallel-planner.mjs` proves that pending phases have no unmet dependency, no target path overlap, and no manual/external-state ambiguity. Users do not pass a public phase parallelism option; `PHASE_PARALLEL_AUTO=false` is only a runtime kill switch. Phase-internal implementation may also run in parallel when `WORKSETS.yaml` defines non-overlapping `ownedPaths` and the coordinator can safely merge the worktree diffs.

Allowed examples:
- `codex-review-code` + `session-logger`
- `codex-review-code` + `browser-verifier` (rerun runtime checks if review changes code)
- `security-reviewer` + `browser-verifier` after implementation when inputs are disjoint
- finish-stage logging in parallel with review only when it does not finalize completion state
- `efficiency-tracker` only for explicit deprecated/historical reporting, never as a default parallel stage
- automatic phase waves from `moonshot-phase-runner` when the planner returns `parallel_wave`

Not allowed:
- `codex-validate-plan` + `implementation-runner`
- `requirements-analyzer` + `context-builder`
- `completion-verifier` + code-changing remediation
- final finish-stage closeout before review/verify verdicts settle
- phase waves with ambiguous dependency, target overlap, shared mutable config/lockfile targets, or manual/external-state smoke requirements

## Review / Verify Coordination

- Treat `review-bundle` as the first post-implementation stage for non-trivial code changes.
- `verification-bundle` may start in parallel only for checks that do not depend on review findings remaining unchanged.
- If review causes code changes, rerun affected verify/runtime steps before any finish-stage action.
- `finish-bundle` begins only after the active review/verify verdict is stable enough to support closeout.

## Token Duplication Avoidance
1. Prepare one shared snapshot (paths and minimal metadata only).
2. Pass role-specific inputs only.
3. Do not inline file content in orchestration notes.
4. Return summarized outputs, then re-run required gates if code changed.

## Cross-Runtime Evidence

- Parallel decisions must record `selectedHarnessComponents`, `skippedHarnessComponents`, and `selectionReason` in workflow evidence.
- Review/verify forks should record `runtimeIsolation` as `isolated`, `degraded-current-session`, or an equivalent adapter-specific phrase.
- Effort profile is selected once per work unit and recorded as `modelEffortProfile`; parallel workers inherit it unless a workset explicitly overrides it.
- Simple/local work may skip heavy harness components, but the skip reason must be explicit instead of inferred.

## Execution Script Logic
```bash
# 1) Planning gate (sequential)
codex-validate-plan --feature {feature_name}
karpathy-execution-gate --feature {feature_name}

# 2) Implementation (sequential)
implementation-runner --feature {feature_name}

# 3) Independent post-implementation checks (optional parallel)
codex-review-code --feature {feature_name} &
REVIEW_PID=$!

session-logger --feature {feature_name} &
LOG_PID=$!

wait $REVIEW_PID
wait $LOG_PID
```

## Synchronization Points
| Timing | Event | Action |
|---|---|---|
| Planning complete | Start implementation | Run sequentially after validation gate |
| Implementation complete | Start optional parallel checks | Run only independent stages together |
| Review changed code | Re-run gates | Re-run affected verify/runtime checks |
| Checks complete | Merge decision | Continue fix-forward policy |
