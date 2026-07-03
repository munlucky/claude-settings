# Spec Delta

## New Source Files

```text
schemas/retro.collect.schema.json
schemas/retro.daily.schema.json
schemas/retro.improvement-candidate.schema.json
schemas/retro.import-result.schema.json
schemas/retro.issue-draft.schema.json
templates/retro/COLLECT_SUMMARY.md
templates/retro/DAILY_RETRO.md
templates/retro/IMPROVEMENT_PROPOSAL.md
templates/retro/GITHUB_ISSUE_DRAFT.md
tools/retro/retro-cli.mjs
tools/retro/collect.mjs
tools/retro/retro-store.mjs
tools/retro/retro-normalize.mjs
tools/retro/retro-patterns.mjs
tools/retro/daily-retro.mjs
tools/retro/improvement-proposer.mjs
tools/retro/issue-draft-writer.mjs
skills/moonshot-retro/SKILL.md
skills/moonshot-retro/SKILL.ko.md
docs/public/guidelines/daily-retro-workflow.md
docs/public/guidelines/daily-retro-workflow.ko.md
tests/fixtures/retro/2026-07-03/*.collect.json
tests/retro-collect-contract.test.mjs
tests/retro-redaction-contract.test.mjs
tests/daily-retro-contract.test.mjs
tests/retro-improvement-proposer-contract.test.mjs
tests/retro-issue-draft-contract.test.mjs
tests/retro-cli-contract.test.mjs
tests/retro-no-promotion-authority-contract.test.mjs
```

`schemas/retro.improvement-candidate.schema.json` must not silently fork the existing improvement model. It should be a retro-specific envelope that either:

- references or maps into `schemas/improvement-candidate-v1.schema.json` for candidate lifecycle fields, or
- explicitly documents why daily retro candidates require a narrower advisory contract.

`schemas/retro.issue-draft.schema.json` should likewise stay separate from `schemas/improvement-proposal.schema.json` only for draft rendering metadata. Durable promotion/proposal semantics remain owned by the existing improvement schemas.

## Existing Source Files to Modify

```text
bin/moonshot-relay.mjs
package.json
README.md
docs/public/repository-layout.md
docs/public/reference/runtime-skill-surface.md
package/package-contract.yaml
tests/package-layout.test.mjs
tests/package-materialization.test.mjs
```

`docs/public/repository-layout.md` must add `daily-retro-workflow.md` / `daily-retro-workflow.ko.md` to the Public Guideline Classification table, with class `operational-procedure` and durable detail owners `tools/retro/**`, `schemas/retro.*`, `templates/retro/**`, and `skills/moonshot-retro/**`.

## Runtime State Paths

```text
.moonshot-relay/retro-outbox/<YYYY-MM-DD>/*.collect.json
${MOONSHOT_RELAY_HOME:-~/.moonshot-relay}/state/projects/<projectId>/retro/inbox/<YYYY-MM-DD>/*.collect.json
${MOONSHOT_RELAY_HOME:-~/.moonshot-relay}/state/projects/<projectId>/retro/daily/<YYYY-MM-DD>/daily-retro.json
${MOONSHOT_RELAY_HOME:-~/.moonshot-relay}/state/projects/<projectId>/retro/daily/<YYYY-MM-DD>/daily-retro.md
${MOONSHOT_RELAY_HOME:-~/.moonshot-relay}/state/projects/<projectId>/retro/daily/<YYYY-MM-DD>/improvement-candidates.json
${MOONSHOT_RELAY_HOME:-~/.moonshot-relay}/state/projects/<projectId>/retro/proposals/*.md
${MOONSHOT_RELAY_HOME:-~/.moonshot-relay}/state/projects/<projectId>/retro/issue-drafts/*.md
```

Runtime state paths are generated advisory state and must not be committed.

## Command Contract

```bash
moonshot-relay retro collect --project <id> --task-id <taskId> --task-root <dir> --date <YYYY-MM-DD> [--out <dir>] [--replace] [--json]
moonshot-relay retro import --project <id> --from <dir> --date <YYYY-MM-DD> [--state-root <dir>] [--json]
moonshot-relay retro daily --project <id> --date <YYYY-MM-DD> [--state-root <dir>] [--json]
moonshot-relay retro propose --project <id> --date <YYYY-MM-DD> [--state-root <dir>] [--json]
moonshot-relay retro issue-draft --project <id> --date <YYYY-MM-DD> [--state-root <dir>] [--json]
```

The initial implementation does not expose `create-issues --apply`.

## Required Output Fields

Every generated JSON result includes:

```json
{
  "promotionAuthority": false
}
```

Issue/proposal markdown includes equivalent text metadata.
