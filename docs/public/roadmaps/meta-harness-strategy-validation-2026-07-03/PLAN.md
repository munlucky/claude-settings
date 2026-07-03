# Plan

## Phase 0: Contract Gates

Owned paths:

- `docs/public/guidelines/harness-bootstrap-lab.md`
- this roadmap package

Work:

- confirm ADR/ASR/traceability constraints
- keep all new artifacts non-authoritative
- preserve generated-state/package boundaries

Verification:

```bash
npm run test:package
```

## Phase 1: Failure Signal And Snapshot

Owned paths:

- `tests/fixtures/harness-search-fixtures/**`
- `tools/evals/**`
- `tests/harness-lab-contract.test.mjs`
- `scripts/lib/*snapshot*.mjs` if extracted

Work:

- add failure-rich search fixture set
- add fail-soft redacted environment snapshot artifact
- add redaction tests

Verification:

```bash
npm run test:eval
node --test tests/harness-lab-contract.test.mjs
```

## Phase 2: Read-Only Experience Navigation

Owned paths:

- `tools/harness-lab/harness-history.mjs`
- `package.json`
- `tests/harness-history-contract.test.mjs`

Work:

- implement generated read-model over existing run/baseline/compare artifacts
- implement read-only list/show/failures JSON commands
- add package-exclusion and no-source-mutation tests

Verification:

```bash
node --test tests/harness-history-contract.test.mjs
npm run test:package
```

## Phase 3: Proposal Discipline

Owned paths:

- `tools/harness-lab/harness-loop.mjs`
- `tests/harness-lab-contract.test.mjs`
- `docs/public/guidelines/harness-bootstrap-lab.md`

Work:

- extend `lab:evolve` with child-run `evolve-proposal.json`
- record consulted artifacts, hypothesis, expected metric, risk, rollback, and `promotionAuthority: false`
- keep parent run spec and baseline/current pointers immutable

Verification:

```bash
node --test tests/harness-lab-contract.test.mjs
npm run lab:evolve -- --run-id <parent> --out-run-id <child> --json
```

## Phase 4: Advisory Frontier

Owned paths:

- `tools/harness-lab/harness-history.mjs`
- `tests/harness-history-contract.test.mjs`

Work:

- add report-only frontier command after history data exists
- rank only candidates that already passed hard blocker metrics
- preserve H0 compare/promote/closeout authority

Verification:

```bash
node --test tests/harness-history-contract.test.mjs tests/harness-lab-contract.test.mjs
```

## Phase 5: Controlled Autonomous Search Decision

Do not implement until Phases 1-3 prove useful. A later architecture package must define sandbox, branch/worktree ownership, budget caps, rollback, and review authority before source-mutating proposer loops are allowed.
