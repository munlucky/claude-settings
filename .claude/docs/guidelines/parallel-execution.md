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

Allowed examples:
- `codex-review-code` + `efficiency-tracker`
- `codex-review-code` + `session-logger`
- `codex-review-code` + `browser-verifier` (rerun runtime checks if review changes code)

Not allowed:
- `codex-validate-plan` + `implementation-runner`
- `requirements-analyzer` + `context-builder`

## Token Duplication Avoidance
1. Prepare one shared snapshot (paths and minimal metadata only).
2. Pass role-specific inputs only.
3. Do not inline file content in orchestration notes.
4. Return summarized outputs, then re-run required gates if code changed.

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

efficiency-tracker --feature {feature_name} &
TRACK_PID=$!

wait $REVIEW_PID
wait $TRACK_PID
```

## Synchronization Points
| Timing | Event | Action |
|---|---|---|
| Planning complete | Start implementation | Run sequentially after validation gate |
| Implementation complete | Start optional parallel checks | Run only independent stages together |
| Review changed code | Re-run gates | Re-run affected verify/runtime checks |
| Checks complete | Merge decision | Continue fix-forward policy |
