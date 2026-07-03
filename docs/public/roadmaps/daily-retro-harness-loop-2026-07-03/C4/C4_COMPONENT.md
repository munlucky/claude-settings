# C4 Component

```text
bin/moonshot-relay.mjs
  -> tools/retro/retro-cli.mjs
      -> collect.mjs
      -> retro-store.mjs
      -> retro-normalize.mjs
      -> retro-patterns.mjs
      -> daily-retro.mjs
      -> improvement-proposer.mjs
      -> issue-draft-writer.mjs
      -> templates/retro/**
      -> schemas/retro.*.schema.json
```

## Components

| Component | Responsibility |
|---|---|
| `retro-cli.mjs` | Parse subcommands and route collect/import/daily/propose/issue-draft. |
| `collect.mjs` | Read task closeout evidence and write a validated outbox collect record. |
| `retro-store.mjs` | Resolve runtime paths, read collect files, write derived outputs, reject duplicates according to policy. |
| `retro-normalize.mjs` | Normalize status, score, failure classes, review findings, and evidence refs. |
| `retro-patterns.mjs` | Build repeated failure classes, root patterns, and deterministic candidate IDs. |
| `daily-retro.mjs` | Produce daily JSON and markdown reports. |
| `improvement-proposer.mjs` | Convert patterns to candidate JSON and proposal markdown. |
| `issue-draft-writer.mjs` | Render local issue draft markdown with fingerprint metadata. |
