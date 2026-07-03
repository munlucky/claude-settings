# ADR-0003: Separate Failure-Rich Search Fixtures From Promotion Gates

## Status

Accepted.

## Context

Meta-Harness benefits from search sets where baseline harnesses still fail. Moonshot Relay's default lab gate is intentionally stable and promotion-oriented, so it is not always a useful improvement search surface.

## Decision

Add failure-rich search fixtures as source-owned test inputs with complete fixture identity. Keep them separate from default H0 promotion gates until they are mature enough to become promotion evidence.

## Consequences

- Improvement loops receive stronger diagnostic signal.
- Synthetic or project-specific failures must be reviewed before becoming reusable harness fixtures.
- Fixture identity remains mandatory: `fixtureSetId`, `fixtureId`, `inputHash`, and `scorerVersion`.
