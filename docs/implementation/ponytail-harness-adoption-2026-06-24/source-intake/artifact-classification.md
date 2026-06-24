# Ponytail Artifact Classification

Observed repo: `https://github.com/DietrichGebert/ponytail`
Observed commit: `17a466013e7956f91418d188a960754ba26a1bdf`
Observed version: `v4.8.1`
License: MIT

| Artifact | Category | Static / Executable | Adoption Relevance | Branch Impact |
|---|---|---|---|---|
| `AGENTS.md` | instruction-tier profile rule | static text | Good source for minimal-correct-implementation wording. | Reference only; do not paste into root `AGENTS.md`. |
| `skills/ponytail/SKILL.md` | skill instruction | static text | Contains useful ladder, safety exclusions, and "read first, then simplify" framing. | Reference only for Phase 02 guideline. |
| `skills/ponytail-review/SKILL.md` | review skill instruction | static text | Useful as optional complexity-only review rubric. | Reference only; may inform Phase 02/03 decision. |
| `.codex-plugin/plugin.json` | plugin manifest | static manifest that activates executable hooks | Shows Codex plugin shape and runtime capabilities. | Do not package or install in Phase 01/02. |
| `hooks/claude-codex-hooks.json` | lifecycle hook manifest | executable command manifest | Declares SessionStart and UserPromptSubmit commands. | Disabled unless Phase 03/04 approves managed hooks. |
| `hooks/ponytail-activate.js` | lifecycle hook implementation | executable Node script | Writes mode state and emits context. | Disabled; conflicts with controlled runtime profile adoption without explicit gate. |
| `hooks/ponytail-mode-tracker.js` | lifecycle hook implementation | executable Node script | Tracks prompt commands and writes mode state. | Disabled; requires hook smoke and permission review. |
| `hooks/ponytail-runtime.js` | hook runtime helper | executable support code | Writes/deletes `.ponytail-active` under host state dirs. | Disabled with hooks. |
| `hooks/ponytail-config.js` | hook config helper | executable support code | Reads env/config; can write Ponytail config when called by other code. | Disabled with hooks. |
| `docs/agent-portability.md` | portability design note | static docs | Confirms thin host adapter pattern. | Reference only. |
| `LICENSE` | license | static text | MIT attribution evidence. | Required for any copied wording. |

Classification decision: use Ponytail as source-pinned guidance only in the first implementation branch. Managed skill/plugin/hook adoption requires later approval and package/runtime-surface gates.
