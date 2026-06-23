# ADR-001 - Preserve Runtime-State Authority

Status: Accepted

Date: 2026-06-23

## Context

The evidence-driven harness design introduces source-bound artifacts such as `review.json`, `verify.json`, `score.json`, `submission.json`, and append-only JSONL receipts. The current Moonshot Relay control plane already treats `runtime-state.sqlite` and its runtime events, eval results, blockers, and completion decisions as the workflow authority.

Replacing that authority during early implementation would create split-brain completion semantics. It would also let candidate-generated evidence appear more authoritative than the runtime-state completion decision model.

## Decision

Use a hybrid-extension model:

```text
review.json / verify.json / score.json / submission.json / JSONL receipts
  -> structured evidence and replay artifacts
  -> runtime_events / eval_results / verification-plane evidence
  -> runtime-state completion_decisions remains whole-plan authority
```

The new artifacts are durable evidence inputs and replay receipts. They do not directly close a run, submit a delivery, mutate live profiles, or mark whole-plan completion.

## Consequences

- Phase 02 can define candidate identity and receipt schemas without changing completion authority.
- Phase 05 must prove that `score.status=FULL` is submit eligibility only, not whole-plan completion.
- Phase 06 may add JSONL receipts only as a replay mirror unless a later ADR explicitly changes the event authority model.
- Phase 08 may require FULL evidence before submit, but live account-root/profile adoption still requires explicit approval.

## Guardrails

- `phase-status.yaml` remains a cursor projection only.
- Candidate reports and agent chat output are never completion authority.
- H0 `harness-lab` remains a pre-implementation safety gate outside candidate authority.
- No early phase may mutate `.claude`, `.codex`, account-root, or shared runtime-home state.
