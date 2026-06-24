# Ponytail Hook Inventory

Observed commit: `17a466013e7956f91418d188a960754ba26a1bdf`
Hook manifest: `hooks/claude-codex-hooks.json`
Adoption verdict: disabled for Phase 01 and Phase 02.

## Manifest

The Codex plugin manifest declares:

- `skills: ./skills/`
- `hooks: ./hooks/claude-codex-hooks.json`
- interface capability: `Instructions`, `Lifecycle hooks`

No MCP/tool surface was observed in the plugin manifest.

## Lifecycle Commands

| Event | Matcher | Command | Windows Command | Timeout | Status |
|---|---|---|---|---|---|
| `SessionStart` | `startup|resume|clear|compact` | `node "${CLAUDE_PLUGIN_ROOT}/hooks/ponytail-activate.js"; exit 0` | `if (Get-Command node -ErrorAction SilentlyContinue) { node "$env:CLAUDE_PLUGIN_ROOT\hooks\ponytail-activate.js" }` | 5 seconds | Disabled |
| `UserPromptSubmit` | all prompts | `node "${CLAUDE_PLUGIN_ROOT}/hooks/ponytail-mode-tracker.js"; exit 0` | `if (Get-Command node -ErrorAction SilentlyContinue) { node "$env:CLAUDE_PLUGIN_ROOT\hooks\ponytail-mode-tracker.js" }` | 5 seconds | Disabled |

## Environment Access

Observed environment reads:

- `CLAUDE_PLUGIN_ROOT`
- `PONYTAIL_DEFAULT_MODE`
- `XDG_CONFIG_HOME`
- `APPDATA`
- `CLAUDE_CONFIG_DIR`
- `PLUGIN_DATA`
- `COPILOT_PLUGIN_DATA`

## Filesystem Behavior

Observed reads:

- Ponytail config from `$XDG_CONFIG_HOME/ponytail/config.json`, `~/.config/ponytail/config.json`, or `%APPDATA%\ponytail\config.json`
- `~/.claude/settings.json` or `$CLAUDE_CONFIG_DIR/settings.json` for statusline detection outside Codex/Copilot
- `skills/ponytail/SKILL.md` via `hooks/ponytail-instructions.js`

Observed writes/deletes:

- `.ponytail-active` under `PLUGIN_DATA` for Codex, `COPILOT_PLUGIN_DATA` for Copilot, or `$CLAUDE_CONFIG_DIR` / `~/.claude` for Claude.
- `writeDefaultMode()` in `hooks/ponytail-config.js` can create/write the Ponytail config path when called, although the inspected lifecycle hooks do not call it directly.

## Network And Process Behavior

- No `fetch`, `http`, `https`, `net`, `child_process.spawn`, or `child_process.exec` behavior was observed in inspected hook scripts.
- Lifecycle commands invoke local `node`.
- Hook scripts silently ignore many read/write/parse errors.
- Manifest timeout is 5 seconds for each hook command.

## Moonshot Compatibility Decision

The hooks write host-local state and inject runtime context. That is not acceptable as an implicit Phase 01/02 adoption path because Moonshot Relay keeps runtime-state authority, package runtime surface expansion, and live profile sync behind explicit gates. Managed hook adoption remains possible only after Phase 03 permission review and Phase 04 hook smoke/approval artifacts.
