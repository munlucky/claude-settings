# Commit Moonshot Reference

`commit-moonshot` is an explicit finish-stage utility for runs where the user asks for both project-memory refresh and Git closeout.

The active script entrypoints are:

- `node <MOONSHOT_RELAY_HOME>/scripts/commit-moonshot-memory-refresh.mjs --project-id <PROJECT_ID>`
- `node <MOONSHOT_RELAY_HOME>/scripts/commit-moonshot-promotion-audit.mjs --project-id <PROJECT_ID> --json`

Project knowledge writes default to the account-root project namespace under `${MOONSHOT_RELAY_HOME:-~/.moonshot-relay}/state/projects/<projectId>/knowledge`. Raw memorygraph databases, logs, transcripts, and cache artifacts are runtime state and are not commit payloads unless the user explicitly asks to include a reviewed artifact.
