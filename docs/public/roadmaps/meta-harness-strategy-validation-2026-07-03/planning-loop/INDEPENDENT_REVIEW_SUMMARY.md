# Independent Review Summary

Status: complete.

Reviewer lanes:

| Lane | Reviewer Focus | Result |
|---|---|---|
| Public research validation | Paper, project page, official repository | Mechanics are valid; strongest improvement basis is full prior trace/source/score access plus hard search fixtures. |
| Codebase fit validation | Current harness-lab extension points and duplicate risks | Do not create a new authoritative store; add read-model/query/proposal artifacts over existing run kernel and compare outputs. |
| Architecture risk validation | H0 authority, package boundary, generated state, account-root isolation | Adopt only behind ADR/ASR gates; all new surfaces must be non-authoritative and generated-state safe. |

## Public Research Review

The research reviewer found high improvement potential for:

- generated experience/read-model over prior candidates
- read-only history query CLI
- failure-rich search fixture set
- advisory Pareto/frontier ranking after enough comparable history exists

The reviewer marked `lab:evolve` proposal artifacts as useful only if they record reviewable proposal evidence, not raw reasoning. Environment snapshots should be sanitized run records by default, with prompt injection only as a later opt-in.

Primary sources reviewed:

- <https://arxiv.org/abs/2603.28052>
- <https://arxiv.org/html/2603.28052v1>
- <https://yoonholee.com/meta-harness/>
- <https://github.com/stanford-iris-lab/meta-harness>
- <https://github.com/stanford-iris-lab/meta-harness-tbench2-artifact>

## Codebase Fit Review

The codebase reviewer found that Moonshot Relay already has:

- `run-spec.json`, `events.jsonl`, `lab-result.json`
- single-run projection and ledger verification
- metric compare, fixture identity, baseline/current pointer, closeout receipt

Therefore:

- Harness Experience Store should be scaled down to a rebuildable read-model/index.
- `harness-history` should be read-only and likely owned by `tools/harness-lab/harness-history.mjs`.
- `lab:evolve` should keep existing child lineage and add only child-run proposal evidence.
- failure-rich search fixtures should remain separate from current research fixtures.
- environment snapshots should normalize existing scattered runtime identity data.
- Pareto/frontier ranking should be deferred until history/read-model exists.

The reviewer reported these checks passed:

```bash
node --test tests/harness-lab-contract.test.mjs tests/research-fixture-scorer-contract.test.mjs
npm run test:eval
```

## Architecture Risk Review

The risk reviewer required hard stops:

- Experience/history outputs must not replace `lab-result.json`, compare reports, promotion manifests, or closeout receipts.
- History output must not expose live account-root/profile state, raw logs, transcripts, MemoryGraph/KG dumps, or secret-like env/config values.
- `lab:evolve` must not mutate parent specs, baseline manifests, `current.json`, source files, or live account-root profiles.
- Search fixtures must not promote private runtime output into source fixtures.
- Environment snapshots must not capture auth/config/env secrets.
- Frontier ranking must not bypass fixture identity, no-regression, strict-improvement, compare/promote, or closeout gates.

These requirements were folded into `ASR_CATALOG.md`, `TRACEABILITY_MATRIX.md`, and ADR-0001 through ADR-0005.

## Final Synthesis

The strategy is likely to improve Moonshot Relay, but the improvement class differs by feature:

- Direct benchmark/search improvement: failure-rich fixtures and selective environment snapshots.
- Diagnosis and operator throughput improvement: history CLI, generated read-model, proposal artifacts.
- Decision quality improvement: advisory frontier after enough comparable history exists.

Implementation should start with gates and search signal, not with a large autonomous optimizer.
