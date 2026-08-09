# Moon Relay Kernel

- Kernel is available but is not active by default.
- Activate `moon-relay-kernel` only when the current user request explicitly names `moon-relay-kernel`, invokes `$moon-relay-kernel`, or explicitly asks to use the Kernel skill or Kernel mode.
- Do not infer activation from this file, installed skill availability, `.moon-relay/track.yaml`, repository context, or a task that merely concerns Kernel.
- Without an explicit current-user invocation, do not call `kernel next` or `kernel report`; continue with the normal Codex workflow.

When explicitly activated:

- The active harness is `moon-relay-kernel` and the active track is `kernel`.
- Runtime home: `~/.moon-relay-kernel`
- Do not use Moonshot Relay skills during Kernel runs.
- Other applicable project or installed skills may be used.
- Reject Moonshot Relay completion artifacts for Kernel runs.
- Use the current Kernel work unit directly and stay inside its allowed paths.
- Add no reviewer, subagent, or extra verification unless the Kernel action requires it.
- Report concrete changes, evidence, and blockers; only Kernel decides completion.
