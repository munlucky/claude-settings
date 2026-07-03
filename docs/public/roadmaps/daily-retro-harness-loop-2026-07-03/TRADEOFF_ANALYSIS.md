# Tradeoff Analysis

| Decision | Choice | Benefit | Cost / Risk | Mitigation |
|---|---|---|---|---|
| Storage split | Runtime outbox plus account-root retro state | Keeps project export and control-plane analysis separate | Operators need import step | Provide explicit `retro import` and docs examples |
| Initial command surface | `retro import`, `daily`, `propose`, `issue-draft` | Matches actual lifecycle | More commands to test | Add a single `retro-cli.mjs` dispatch and focused tests |
| Proposal authority | Advisory only | Avoids accidental harness mutation | Requires separate implementation PR | Proposal template includes target files and acceptance criteria |
| GitHub integration | Draft-only first | Avoids remote write surprises | Manual step remains | Later phase can add `create-issues --apply` with fingerprint checks |
| Harness-history relationship | Separate plane | Preserves current lab contracts | Some duplication in redaction helpers | Extract common helpers only after both paths stabilize |
| Candidate threshold | Repeated/contract-backed patterns only | Reduces over-generalized harness patches | Some real issues may start as watch items | Daily report can record watch items without generating P0/P1 proposals |
| Package/runtime adoption | Source first, install later | Avoids profile drift | Requires explicit adoption phase | Phase 05 records package and install verification evidence |

## Key Risk: Over-Generalization

Prior project memory records a hard-earned rule: downstream project symptoms must not be promoted into harness patches unless there is source/template evidence, an explicit contract violation, unrelated project recurrence, or a project-neutral failing/missing regression test.

This plan embeds that rule in daily/proposer acceptance:

- isolated project-specific failures stay in the daily report as observations.
- improvement candidates require a project-neutral explanation.
- candidate markdown must include evidence class and target layer.

## Key Risk: Authority Confusion

Retro outputs can look like closeout evidence because they summarize scores and failures. To prevent authority confusion:

- schemas require `promotionAuthority: false`.
- docs state that retro reports cannot change verify/score/closeout.
- tests assert no retro output can declare promotion authority.
- issue drafts say "advisory only; human approval required."

