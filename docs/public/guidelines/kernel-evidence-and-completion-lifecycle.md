# Kernel Evidence and Completion Lifecycle

Kernel binds every executable proof to a project-declared command reference before a Run starts. A structured evidence plan or tier-required proof-policy obligation that has no usable command returns `unsupported-verification`; it does not create a Run and defer failure until after implementation. A genuine greenfield Run may defer only implicit proof-policy bindings until its walking skeleton creates the first manifest; an explicit acceptance evidence plan is never deferred.

Host identity is canonical at the same boundary. Conflicting CLI, environment, or native-host session/run identifiers return a binding conflict with relaunch guidance instead of applying precedence.

Supported executable verification methods are:

- `static-analysis`
- `build`
- `unit-test`
- `integration-test`
- `e2e`
- `runtime-reproduction`
- `runtime-observation`
- `deployment`
- `post-deployment-observation`

`judgment` remains a separate evidence class and cannot replace executable proof. Protected or T3 judgments require a Kernel-owned independent review receipt.

Projects may declare a completion predicate in the task contract:

```json
{
  "completionPredicate": {
    "requiredOutcomes": ["implemented", "verified", "deployed", "observed", "resolved"]
  }
}
```

Each required outcome after `implemented` must have an acceptance evidence plan whose method or explicit `outcome` binds it to compatible evidence. Executable outcomes read Kernel verification receipts; judgment outcomes read Kernel review receipts. A build proves `verified`; it cannot prove `deployed`, `observed`, or `resolved`. `kernel next` and completion projections expose these stages independently, and Kernel acceptance remains the only authority that can return `done`.

Kernel doctor also reports an untouched active Run as `stale_active_run` when it has remained idle for at least 24 hours with a ready step and no attempt, capsule, verification, or completion receipt. The recovery choices are `resume`, `replan`, and `abort-and-successor`; doctor does not choose or mutate one automatically.
