# ADR-0004: Keep Evolve Proposal Artifacts Child-Run Local

## Status

Accepted.

## Context

`lab:evolve` already creates child run lineage. The missing piece is a reviewable proposal artifact that explains why the child exists and what evidence it consulted.

## Decision

Write proposal evidence only under the child run output, for example `runs/<child-run-id>/evolve-proposal.json`. The artifact records consulted evidence, hypothesis, expected metric impact, risk, rollback, and `promotionAuthority: false`.

## Consequences

- Parent specs, baseline manifests, current pointers, source files, and live account-root profiles remain immutable.
- Reviewers can audit proposal reasoning without accepting raw chain-of-thought or private traces.
- Proposal artifacts can guide evaluation but cannot satisfy closeout.
