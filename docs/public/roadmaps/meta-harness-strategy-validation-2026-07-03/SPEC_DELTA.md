# Spec Delta

## New Generated Artifacts

### Experience Index

Path pattern:

```text
.moonshot-relay/harness-lab/experience/index.json
.moonshot-relay/harness-lab/experience/runs/<run-id>.json
```

Schema intent:

- `schemaVersion: "moonshot-harness-experience-index.v1"`
- source run ID, spec hash, candidate hash, compare hash
- failure classes, metrics, promotion decision
- artifact paths and SHA-256 hashes
- capped excerpts or excerpt paths only after redaction
- `promotionAuthority: false`

### Proposal Artifact

Path pattern:

```text
.moonshot-relay/harness-lab/runs/<child-run-id>/evolve-proposal.json
```

Schema intent:

- `schemaVersion: "moonshot-harness-evolve-proposal.v1"`
- parent run ID and parent spec hash
- consulted run IDs and artifact hashes
- hypothesis
- isolated change target
- expected metric and verification signal
- risk and rollback path
- `promotionAuthority: false`

### Environment Snapshot

Path pattern:

```text
.moonshot-relay/harness-lab/runs/<run-id>/environment-snapshot.json
```

Schema intent:

- Node/npm/git/Docker versions
- cwd and source fingerprint reference
- available package managers and language runtimes
- memory and OS summary
- redaction status
- collection failures as warnings

## New CLI Surface

Potential commands:

```bash
node tools/harness-lab/harness-history.mjs build-index --json
node tools/harness-lab/harness-history.mjs list --json
node tools/harness-lab/harness-history.mjs failures --class score_drop --json
node tools/harness-lab/harness-history.mjs show --run-id <run-id> --json
node tools/harness-lab/harness-history.mjs frontier --json
```

No command writes canonical source. `build-index` writes generated state only.

## Changed Existing Surface

`tools/harness-lab/harness-loop.mjs evolve` should continue to create a child run spec and append `run.evolved`, but also write `evolve-proposal.json` when proposal fields are supplied or derivable.
