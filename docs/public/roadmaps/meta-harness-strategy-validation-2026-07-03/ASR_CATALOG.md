# ASR Catalog

## ASR-001: H0 Authority Preservation

The new history and proposal surfaces must not become promotion authority. H0 `lab-result.json`, compare reports, promotion manifests, and closeout receipts remain the commit-consumable evidence path.

Quality scenario: when a proposal artifact claims improvement but compare report fails, `lab:closeout` still returns non-consumable.

## ASR-002: Generated-State Boundary

Experience indexes, snapshots, and proposal evidence are generated state under `.moonshot-relay/harness-lab/**` or explicitly ignored output paths. Canonical docs may describe schemas and commands, but not store raw run logs.

Quality scenario: package dry-run excludes generated experience data and no package payload contains `events.jsonl`, sqlite, traces, cache, or raw stdout/stderr bodies.

## ASR-003: Queryability Without Prompt Bloat

The history CLI should expose compact, typed views over large evidence. It should support JSON output and targeted file references so agents can inspect only needed artifacts.

Quality scenario: `history failures --class score_drop --json` returns run IDs, paths, hashes, and excerpts capped by policy.

## ASR-004: Search Fixture Separation

Search fixtures should help discover improvement opportunities and regressions. Promotion fixtures should remain stable H0 gates.

Quality scenario: a deliberately bad candidate fails search fixtures with diagnostic failure classes, while the default promotion suite remains deterministic.

## ASR-005: Environment Snapshot Safety

Snapshots must improve diagnosis without leaking secrets or creating brittle hard gates.

Quality scenario: snapshot records tool availability, versions, cwd, package managers, memory, and Docker identity, while redacting env values and token-like strings.

## ASR-006: Multi-Metric Honesty

Frontier reports may rank candidates across score, duration, stale artifacts, and mutation breadth, but they must be advisory until bound to H0 compare policy.

Quality scenario: frontier output includes `promotionAuthority: false`.

## ASR-007: Fixture Identity Completeness

Every new search fixture that participates in stable/candidate comparison must include `fixtureSetId`, `fixtureId`, `inputHash`, and `scorerVersion`.

Quality scenario: a missing fixture identity field fails the fixture contract before comparison.

## ASR-008: Proposal Parent Immutability

`lab:evolve` proposal evidence must be written only under the child run output. Parent `run-spec.json`, baseline manifests, current baseline pointers, source files, and live account-root profiles must remain unchanged.

Quality scenario: evolve tests compare the parent spec before and after proposal creation.
