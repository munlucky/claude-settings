# Meta-Harness Optimization Boundary

## Allowed Scope

The optimizer may propose changes only to harness-owned assets:
- `.claude/scripts/**`
- `.claude/templates/**`
- `.claude/skills/**`
- `.claude/docs/guidelines/**`
- `.claude/docs/tasks/**`

## Forbidden Scope

The optimizer may not mutate:
- downstream project code outside `.claude/**`
- secrets, credentials, or environment files
- unrelated task artifacts not referenced by the active trace

## Adoption Rule

A candidate harness change is adoptable only when:
1. it stays inside the allowed scope
2. it produces structured rationale tied to a trace bundle
3. harness-local validation passes
4. benchmark output is available for comparison

## Benchmark Minimum

Every candidate should be comparable on:
- closeout status
- evidence freshness
- score verdict
- blocker count
- diagnosis artifact availability
