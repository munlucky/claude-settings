# Tradeoff Analysis

## Feature Matrix

| Feature | Expected Improvement | Evidence Strength | Cost | Main Risk | Decision |
|---|---|---:|---:|---|---|
| Harness Experience Store | Better diagnosis and reuse of past failure evidence. | High | Medium | Generated state could be mistaken for source truth or duplicate existing run artifacts. | Scaled adoption as rebuildable read-model. |
| `harness-history` CLI | Faster, repeatable inspection of prior runs; less manual spelunking. | High | Low | CLI drift from artifact schemas. | Adopt with contract tests. |
| `lab:evolve` proposal artifact | Turns child lineage into auditable hypotheses and verification plans. | High | Low-Medium | Proposal narrative may be over-trusted. | Adopt with `promotionAuthority: false`. |
| Failure-rich search fixtures | Gives improvement loops a non-saturated search surface. | Medium-High | Medium | Overfitting to synthetic failures. | Adopt with fixture identity and held-out promotion gates. |
| Run environment snapshot | Reduces wasted setup/probing in tasks with non-obvious runtime. | Medium | Low-Medium | Secret leakage or noisy snapshots. | Adopt fail-soft with redaction. |
| Pareto/frontier ranking | Better selection across score, speed, context, and safety. | Medium | Medium | Could weaken strict promotion policy or run before comparable history exists. | Defer until history/read-model exists. |

## True-Improvement Assessment

These changes are likely to improve Moonshot Relay's ability to make harness improvements, but only some directly improve benchmark pass rates.

- Direct benchmark improvement is most plausible for failure-rich search fixtures and selective environment snapshots, because they change search signal or reduce wasted environment-probing.
- Operator throughput and diagnosis quality improvement is most plausible for history CLI, generated experience read-model, and proposal artifacts.
- Pareto/frontier ranking improves decision quality only after enough comparable candidate data exists and blocker metrics are already passed.

## Non-Negotiable Constraints

- No raw trace bodies in canonical source.
- No live account-root mutation.
- No autonomous source edits in normal `lab:candidate`.
- No replacement of compare/promote/closeout authority.
- No raw logs, transcripts, MemoryGraph/KG dumps, or secret-like environment values in history-facing output.
