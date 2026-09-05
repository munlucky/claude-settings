# Wave B0 — Safety / Characterization Freeze

기준 시점: `2026-09-05`  
기준 checkout: `0d12bbd75d989f814632ee8414e25ab5bb100566`  
기준선: Capability Asset Baseline Final (`6a3231246589b7e6b99804c4ac1ac0332ebced1b`)

이 문서는 Phase B Decomplexification이 보존해야 할 현재 사용자 행동의 실행 가능한 기준선이다. `tests/kernel-decomplexification-characterization.test.mjs`가 아래 시나리오를 기존 focused test에 연결하고, 새 child process에서 전체 focused characterization suite를 실행한다.

| Scenario | Existing characterization surface |
| --- | --- |
| `simple-bugfix` | `tests/kernel-codex-model-policy.test.mjs` |
| `normal-implementation` | `tests/kernel-codex-model-policy.test.mjs` |
| `complex-implementation` | `tests/kernel-codex-model-policy.test.mjs` |
| `planning` | `tests/kernel-codex-model-policy.test.mjs` |
| `resume` | `tests/kernel-resume-lease.test.mjs` |
| `verification-failure` | `tests/kernel-completion-gate-recovery.test.mjs` |
| `high-risk-review` | `tests/kernel-independent-review-session.test.mjs` |
| `knowledge-retrieval-and-commit` | `tests/kernel-knowledge-lifecycle-e2e.test.mjs` |
| `knowledge-supersession` | `tests/kernel-knowledge-supersession.test.mjs` |
| `parallel-session` | `tests/kernel-parallel-runtime.test.mjs`, `tests/kernel-cross-surface-e2e.test.mjs` |
| `git-closeout` | `tests/kernel-git-closeout-e2e.test.mjs` |

## Baseline measurements

The measurements below are deliberately descriptive. They are not completion claims for later waves.

| Metric | B0 value | Measurement boundary |
| --- | ---: | --- |
| Kernel/Host production files | 169 | `scripts/kernel`, `kernel`, `package/kernel`; `.mjs/.yaml/.json` only |
| Kernel/Host production LOC | 31,028 | same boundary, physical lines |
| `control-plane.mjs` LOC | 4,227 | `scripts/kernel/control-plane.mjs` |
| SQLite `CREATE TABLE` statements | 37 | `scripts/kernel/state-store.mjs` |
| Current logical model-class references | 675 | `frontier_reasoning`, `value_coding`, `kernel` occurrences in Kernel/policy surface |
| Workload classes in the target contract | 4 | `planning`, `complex_implementation`, `review`, `standard` |
| Default Astra escalation path | 0 | B0 target policy; implementation is verified in Wave B2/B3 |

## Freeze rules

- `next/report`, resume, fresh verification, protected review, knowledge retrieval/commit/supersession, parallel-session isolation, and Git closeout remain covered by focused tests.
- B0 adds characterization only; it does not delete an authority, rewrite production state, or move runtime behavior.
- Runtime state, logs, caches, traces, SQLite files, verdict JSON, and existing Relay runtime data are not modified by this artifact or its test.
- A later wave may replace a focused test only after the replacement proves the same preservation boundary and is connected to `npm test`.

Run the freeze directly with:

```text
npm run test:decomplexification
```
