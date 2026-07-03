# Phase 04 - Proposal and Issue Draft

## Objective

Daily retro patterns를 하네스 개선 후보와 사람이 검토할 issue draft로 변환한다.

## Surface Classification

- `source_only`: proposer, issue draft renderer, templates, tests.
- `external_deployment_or_service`: deferred; no GitHub API write in this phase.

## Owned Paths

```text
tools/retro/improvement-proposer.mjs
tools/retro/issue-draft-writer.mjs
templates/retro/IMPROVEMENT_PROPOSAL.md
templates/retro/GITHUB_ISSUE_DRAFT.md
tests/retro-improvement-proposer-contract.test.mjs
tests/retro-issue-draft-contract.test.mjs
```

## Read-Only Paths

```text
schemas/improvement-candidate-v1.schema.json
schemas/improvement-proposal.schema.json
```

## Required Behavior

- `retro propose --project <id> --date <YYYY-MM-DD> --json`.
- `retro issue-draft --project <id> --date <YYYY-MM-DD> --json`.
- candidate ID is deterministic: `HARN-YYYYMMDD-NNN-<slug>` or equivalent stable format.
- retro candidate JSON maps to the existing improvement candidate/proposal model where lifecycle or promotion semantics are needed; retro-specific fields remain an advisory envelope.
- proposal includes problem, evidence, proposed change, target files, risks, rollback, and acceptance criteria.
- issue draft includes duplicate fingerprint metadata but performs no network write.
- every output remains advisory.

## Acceptance Criteria

- `acceptance_mapping_missing` repeated twice maps to a planning/validation candidate.
- `verification_evidence_missing` maps to a P0 verification candidate.
- `docs_not_updated` maps to a P2 documentation candidate.
- issue draft includes fingerprint comment and `promotionAuthority=false`.

## Verification

```bash
node tools/retro/retro-cli.mjs propose --project fixture --date 2026-07-03 --state-root <temp> --json
node tools/retro/retro-cli.mjs issue-draft --project fixture --date 2026-07-03 --state-root <temp> --json
node --test tests/retro-improvement-proposer-contract.test.mjs tests/retro-issue-draft-contract.test.mjs
npm run test:retro
```
