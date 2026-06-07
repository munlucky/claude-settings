# Commit Moonshot Reference

`commit-moonshot` is an explicit finish-stage utility for runs where the user asks for both project-memory refresh and Git closeout.

The active script entrypoints are:

- `node <MOONSHOT_RELAY_HOME>/scripts/commit-moonshot-memory-refresh.mjs --project-id <PROJECT_ID>`
- `node <MOONSHOT_RELAY_HOME>/scripts/commit-moonshot-promotion-audit.mjs --project-id <PROJECT_ID> --json`

When an active phase runner identity exists, pass `--run-id`, `--goal-id`, and `--workspace-id` so the helpers record commit closeout runtime events under that run. Without those arguments, helpers use an audit-only commit closeout identity that cannot satisfy whole-plan completion authority.

Commit closeout event payloads may include status, warning codes, sanitized counts, route, and log path. They must not include raw MemoryGraph/KG/ontology/log/transcript payloads and must not create accepted completion decisions.

Project knowledge writes default to the account-root project namespace under `${MOONSHOT_RELAY_HOME:-~/.moonshot-relay}/state/projects/<projectId>/knowledge`. Raw memorygraph databases, logs, transcripts, and cache artifacts are runtime state and are not commit payloads unless the user explicitly asks to include a reviewed artifact.
