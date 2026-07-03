# Current Architecture Evidence

## Source Boundaries

Repository instructions identify canonical source as:

```text
skills/
agents/
rules/
bin/
tools/
schemas/
templates/
tests/
docs/public/
allowlisted scripts/
```

Local `.claude/`, `.codex/`, and `.moonshot-relay/` are runtime/profile state and must not be treated as source of truth.

## Existing CLI

`bin/moonshot-relay.mjs` currently:

- resolves `repoRoot` from the bin path
- routes `install`, `bridge`, and `delivery submit`
- defaults to `install`
- rejects unknown commands
- delegates to source scripts with `spawnSync`

Retro should follow this pattern by adding an explicit `retro` command and routing to `tools/retro/retro-cli.mjs` or equivalent.

## Existing Test Gate

`package.json` defines:

- `npm test` as the active full contract gate
- `npm run test:active` as an alias to `npm test`
- focused harness-lab scripts such as `test:lab`, `lab:history`, and `lab:evolve`

Retro implementation should add `test:retro`, then include retro tests in `npm test` before claiming the feature is complete.

## Existing Harness History Plane

`tools/harness-lab/harness-history.mjs` already provides:

- read-only lab run listing
- experience index generation
- frontier report generation
- secret-like content rejection
- `promotionAuthority: false` on advisory outputs

Retro is different:

- harness history reads lab run artifacts under `.moonshot-relay/harness-lab/**`.
- retro reads task closeout collect records from project outboxes and account-root retro inboxes.
- harness history summarizes candidate/lab performance.
- retro summarizes workflow failures, review findings, replans, and improvement proposals.

Initial implementation should keep them separate and share only concepts, not storage or authority.

## Existing Architecture Roadmap Pattern

Tracked public architecture packages under `docs/public/roadmaps/**` use:

- `README.md`
- `ARCHITECTURE_BRIEF.md`
- `REQUIREMENT_INVENTORY.md`
- `ASR_CATALOG.md`
- `ARCHITECTURE_OPTIONS.md`
- `TRADEOFF_ANALYSIS.md`
- `SPEC_DELTA.md`
- `PLAN.md`
- `TRACEABILITY_MATRIX.md`
- `ARCHITECTURE_REVIEW.md`
- `ADR/*.md`
- `C4/*.md`
- `planning-loop/*`

This package follows that pattern and adds phase-runner docs because the user requested an executable implementation plan.

