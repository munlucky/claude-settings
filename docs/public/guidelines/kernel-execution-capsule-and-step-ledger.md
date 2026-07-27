# Kernel execution capsule and step ledger

Runtime contract for the four artifacts the Kernel added to close the gap
between "the model said it did the work" and "the Kernel can show that it did".
The public surface is unchanged: one skill, and two runtime commands
(`kernel next <run-id>`, `kernel report <run-id> --report-json <file>`).

## The chain

```
Task Contract -> Run Step -> Execution Capsule -> Route Admission
              -> Model Usage Receipt -> Verification / Review Receipt
              -> Completion Decision
```

Every artifact carries `runId`, its plan revision, the `mutationRevision` and
`workspaceIdentity` it describes, and its own digest. An artifact that cannot be
tied back through that chain is not evidence and cannot complete a run.

## Run Step Ledger

The work cursor is persisted, not remembered.

- Ordinary work gets **one synthetic step** covering the whole run, so the
  model-visible loop is exactly what it was.
- The ledger decomposes only when the contract or route says the work is large:
  `taskClass: long-running`, `complex: true`, more than eight changed files, a
  route containing `SLICE`/`SCHEDULE`, an explicit `steps:` decomposition, or a
  requested safe wave.
- `next` returns **one** step: `{ stepId, objective, acceptanceIds,
  allowedPaths, forbiddenPaths }`. `report` answers it; with a decomposed plan
  and more than one runnable unit, the `stepId` is required rather than guessed.
- States: `planned → ready → running → reported → verifying → passed|failed`,
  plus `blocked`, `superseded`, `cancelled`. A failed step retries; a stagnant
  one is replanned.
- A step passes only with current-revision evidence for the obligations it owns
  and coverage for the acceptance it claims. **A passed step is not a completed
  run**: run-level completion still requires every obligation proven at the
  current mutation revision, so later steps that move the workspace force the
  final report to re-prove earlier evidence.
- A replan supersedes the live steps and writes the replacement at the next
  plan revision. Attempted work is never edited.

## Execution Capsule

The bounded brief for one worker session, built from persisted state only.

Contains: objective, acceptance, constraints, non-goals, the work unit
(`allowedPaths`, `forbiddenPaths`, expected outputs), a scoped repository seam
(entrypoints, manifests, ranked relevant files, architecture and knowledge
records, baseline), the obligations with the command refs that can prove them,
permissions, and provenance digests.

Never contains: the conversation, the planner's reasoning, unrelated repository
files, file bodies, secret-bearing paths (`.env`, keys, `secrets/`), or an
environment dump. A capsule assembled with a secret path is refused, not trimmed.

Bounded by `capsuleBudget` (20 files, 30 symbols, 15 knowledge records, 10
architecture records, 10 known failures, 64 KiB). Over-budget capsules reduce in
a declared order — semantic facts, known failures, architecture records,
symbols, adjacent files, acceptance files — and every drop is reported in
`budget.reductions`.

`capsuleId` is derived from the capsule's own digest, which excludes
`createdAt`. The same persisted state therefore rebuilds a byte-identical
capsule, and a capsule built before the workspace moved is detectably stale.

Reviewers receive a **different** capsule (`kernel.review-capsule.schema.json`):
subject, verification evidence, the implementation receipt identity, and the
review scope — read-only, with no implementer context.

## Route Admission

The check between the Kernel's logical model class and the Host's actual
dispatch.

| Decision | Meaning |
| --- | --- |
| `admitted` | The requested class was explicitly resolved and applied. |
| `fallback_admitted` | Applied, but through a session override where an isolated one was asked for. |
| `advisory_admitted` | The installed Host default ran. The class was **not** applied. |
| `blocked` | Hard mismatch. No worker runs. |
| `redecision_required` | Profile, model policy, or capability moved; recompute the route. |

Blocking rules include: a T3 independent review that is not on the frontier
class, is not read-only, has no independent context, or would run on the Host
default; a capsule whose role or permissions contradict the route; a capsule
granting commit or delegation authority; a cost hard cap exceeded; and any
Kernel-owned action (`prove`, `close`), which is never dispatched to a provider.

The admission records digests of the model policy revision, profile,
capabilities, tool policy, and permission policy. Immediately before dispatch
those digests are re-read: a changed profile or capability forces
`redecision_required`, a changed permission or tool policy blocks. The admission
id and digest are written onto the usage receipt, alongside the capsule id and
digest, so the whole lineage resolves from SQLite after a restart.

## Review Receipt

A judgment obligation is proven by a receipt, never by a reviewer string.

The receipt binds the verdict to the reviewer's session, usage receipt, route
decision, model class, and enforcement status, and to the subject reviewed
(workspace identity, mutation revision, changed-paths digest, evidence digest).
The judgment verification points at `review://<run-id>/<receipt-id>` and carries
the receipt's digest.

A receipt is required whenever the obligation is protected, is
`security-review`, or is a judgment obligation in a T3 run. Completion authority
re-derives the lineage itself, so a judgment recorded by any other path cannot
satisfy a protected or T3 obligation. A review whose Host never routed it is
recorded honestly as `unrouted` and can never carry an independent review.

## Migration

New tables are added; nothing is rewritten.

- A run with no ledger rows is given a recovery step at its current state,
  marked `migrationOrigin: legacy-run`.
- Usage receipts written before capsules and admissions existed keep
  `capsuleId`/`admissionId` as `null`; they are never retroactively claimed to
  have had them.
- Review Receipts are enforced from the next review onward. Past judgments are
  not converted into receipts.
- Readers accept one schema version back; writers always write the current one.
