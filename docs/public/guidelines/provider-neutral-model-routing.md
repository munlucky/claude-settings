# Provider Neutral Model Routing

Canonical source guideline for provider-neutral model routing and fallback notes.

Route by task capability, evidence requirement, latency, and tool availability rather than provider preference.
Record fallback behavior when a requested runtime, model, MCP server, or browser capability is unavailable.
Do not hide provider-specific assumptions inside generic workflow docs; name the runtime surface that owns the behavior.
Verification evidence should remain portable: command, artifact, and expected signal must be understandable without provider internals.
