# Phase 04 - Independent Review Engine v1

## Objective

Implement fresh-context review bundle generation and finding disposition rules without letting implementation agents review their own work.

## Dependencies

- Phase 02.
- Phase 03.

## Owned Paths

- `schemas/review-bundle.schema.json`
- `schemas/review-finding.schema.json`
- `scripts/review-bundle-build.mjs`
- `scripts/lib/review-bundle.mjs`
- `tests/review-bundle-contract.test.mjs`
- `tests/review-finding-contract.test.mjs`
- `tests/fixtures/review-bundles/`

## Read-only Paths

- `scripts/lib/runtime-state-store.mjs`
- `scripts/verification-plane.mjs`
- `tools/harness-lab/harness-lab.mjs`

## Work Items

| ID | Work Item | Output |
|---|---|---|
| P04-1 | Define review bundle manifest and redaction rules. | Review bundle schema |
| P04-2 | Generate reviewer input from spec, plan, done, diff, test results, and candidate_id only. | Bundle builder |
| P04-3 | Define finding schema and dispositions. | Finding contract |
| P04-4 | Record review outcomes through runtime events and eval evidence without creating completion authority directly. | Runtime evidence mapping |
| P04-5 | Add workflow guard that autofix creates a new candidate and invalidates stale evidence. | Review lifecycle tests |

## Acceptance Criteria

- Review bundle excludes implementation chat history, hidden reasoning, and self-evaluation.
- Findings use bounded dispositions: `autofix_safe`, `replan_required`, `human_decision`, `informational`.
- Critical findings block score FULL and delivery.
- Reviewer output is evidence input; it does not directly mutate source or state.
- Review outcomes write `runtime_events` for review lifecycle and may write `eval_results` for regression review evidence; only runtime-state completion decisions can close whole-plan completion.
- Bundle manifest includes bundle hash and fresh-session identity evidence.

## Verification Signals

- Review bundle leakage tests.
- Finding disposition contract tests.
- `npm run test:lab`
- `npm test`

## Review-Improvement Loop

- Review focus: context contamination, reviewer prompt leakage, unsafe autofix loops.
- Re-review trigger: bundle contents or finding disposition vocabulary changes.

## Phase 04 Closeout

Status: complete

Completion evidence:

- `schemas/review-bundle.schema.json`
- `schemas/review-finding.schema.json`
- `scripts/review-bundle-build.mjs`
- `scripts/lib/review-bundle.mjs`
- `tests/review-bundle-contract.test.mjs`
- `tests/review-finding-contract.test.mjs`
- `tests/fixtures/review-bundles/README.md`
- `execution/phase-04/SCORECARD.md`
- `execution/phase-04/QA_REPORT.md`
- `execution/phase-04/HANDOFF.md`

Execution decision:

- Phase 05 may consume review finding `blocksFullScore` and review eval evidence mapping.
- Review bundles reject implementation transcript, hidden reasoning, self-evaluation, chat history, and conversation payloads.
