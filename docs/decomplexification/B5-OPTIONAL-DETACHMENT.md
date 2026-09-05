# Wave B5 — Optional Detachment

B5 keeps the Kernel default graph focused on work, evidence, and knowledge. The
reviewer, stagnation, optimization, architecture/planning, retro, audit, and
remote-parity paths remain available, but their implementation modules are
loaded only when their request or work condition is present.

## Activation boundary

`kernel/optional-capabilities.yaml` is the source-facing declaration. Runtime
activation is evaluated by `scripts/kernel/run/optional-capabilities.mjs` and
is request-scoped; no optional capability is added to durable run state merely
because the Kernel was opened.

| Capability | Activation condition |
| --- | --- |
| independent review | review action or explicit review requirement |
| stagnation escalation | repeated failed attempts or explicit request |
| architecture/planning | planning action, planning task, or explicit request |
| remote parity | explicit `commit_and_push` closeout |
| optimization / retro / audit | explicit request only |

Protected review receipts and Kernel proof authority are unchanged. Optional
detachment therefore reduces default imports and hooks without weakening a
review that the contract actually requires.

## Verification

The B0 characterization suite now also checks that the default control-plane,
Git closeout, and unification-audit surfaces use conditional loading for these
optional modules and that the activation predicate remains false for ordinary
work.
