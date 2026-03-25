# browserd

Minimal runtime directory for the planned browser control stack.

Intended responsibilities:

- manage a long-lived headless browser process
- expose localhost-only command endpoints
- preserve browser session state across commands
- support ref-based browser interaction for Codex-native skills

Current phase:

- `client.mjs` + `server.mjs` provide a Node + Playwright runtime
- supported commands: `start`, `stop`, `health`, `goto`, `snapshot`, `click`, `type`, `screenshot`, `console`, `network`
- state is stored at `.claude/browser-runtime/state.json`
- `browserctl.py` remains as a fallback only

Install notes:

- install dependencies in this directory with `npm install`
- install the Playwright browser with `npx playwright install chromium`
- optional override: set `BROWSERCTL_CHROME_PATH` to force a specific Chrome executable

Related documents:

- `.claude/docs/tasks/browser-runtime-integration/context.md`
- `.claude/docs/tasks/browser-runtime-integration/specification.md`
- `.claude/docs/tasks/browser-runtime-integration/patch-design.md`
