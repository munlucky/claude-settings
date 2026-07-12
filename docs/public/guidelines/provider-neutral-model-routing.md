# Provider Neutral Model Routing

Canonical source guideline for provider-neutral model routing and fallback notes.

Route by task capability, evidence requirement, latency, and tool availability rather than provider preference.
The common decision contains route class, effort profile, required capabilities, context action, reason, fallback, and approval requirement. It must not contain provider model names, provider prices, or provider-specific configuration keys.
Each runtime owns a named provider adapter that reports `enforced`, `advisory`, or `unsupported` together with its application surface (`per_turn`, `child_process`, `profile_default`, or `none`). A host without a supported control surface must degrade to advisory; it must not silently rewrite a protected profile configuration.
Record fallback behavior when a requested runtime, model, MCP server, or browser capability is unavailable.
Do not hide provider-specific assumptions inside generic workflow docs; name the runtime surface that owns the behavior.
Verification evidence should remain portable: command, artifact, and expected signal must be understandable without provider internals.
