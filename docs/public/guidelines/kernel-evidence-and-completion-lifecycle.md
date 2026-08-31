# Kernel Evidence and Completion Lifecycle

Kernel binds every executable proof to a project-declared command reference before execution. Acceptance evidence plans are optional refinements: when one is absent, the criterion binds to the applicable proof-policy obligation. A structured plan or tier-required proof-policy obligation that has no usable command returns `unsupported-verification`; a genuine greenfield Run may defer an implicit proof-policy binding until its walking skeleton creates the first manifest. The Kernel computes outstanding obligations from current receipts and runs only the bound hard proof still needed.

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

Each required outcome after `implemented` must have a compatible bound obligation; an acceptance evidence plan may refine that binding with a method, explicit `outcome`, command, or scope. Executable outcomes read Kernel verification receipts; judgment outcomes read Kernel review receipts. A build proves `verified`; it cannot prove `deployed`, `observed`, or `resolved`. `kernel next` and completion projections expose these stages independently, and Kernel acceptance remains the only authority that can return `done`.

Kernel doctor also reports an untouched active Run as `stale_active_run` when it has remained idle for at least 24 hours with a ready step and no attempt, capsule, verification, or completion receipt. The recovery choices are `resume`, `replan`, and `abort-and-successor`; doctor does not choose or mutate one automatically.
