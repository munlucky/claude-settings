# QA Report - Harness Product Readiness Kernel

Status: source closeout ready after final gate rerun.

## Harness Change Ledger

| Area | Change | Verification |
| --- | --- | --- |
| Product doctor | Expanded `scripts/doctor.mjs` into readiness checks for lab, eval, research, profile trust, and generated state boundary. | `node scripts/doctor.mjs check --json` |
| Research fixture | Added pinned `moonshot-research` fixture pack, deterministic scorer, and default lab suite coverage. | `node --test tests/research-fixture-scorer-contract.test.mjs`, `npm run test:eval`, `npm run test:lab` |
| Run kernel | Added immutable `run-spec.json`, hash-chained `events.jsonl`, and lifecycle projection checks. | `node --test tests/harness-lab-contract.test.mjs` |
| Lifecycle commands | Added `run-status`, `resume`, `cancel`, `evaluate`, and `evolve` command contracts. | `node --test tests/harness-lab-contract.test.mjs` |
| Promotion authority | Kept candidate-only runs as smoke evidence and preserved Docker lab calibration/closeout as H0 promotion authority. | `npm run lab:candidate`, `node tools/harness-lab/harness-loop.mjs calibrate --backend docker --promote --json`, `npm run lab:closeout` |
| Package boundary | Moved the superseded containerized harness draft into its plan package as source-local planning material. | `npm run test:package`, `npm test` |

## Residual Risks

- Non-terminal `resume` remains replay-first and does not continue execution; candidate/calibration flows remain the executor authority.
- The research fixture is pinned to one raw evidence pack; future quality improvements should add a filtered-source fixture before using strict improvement claims.
