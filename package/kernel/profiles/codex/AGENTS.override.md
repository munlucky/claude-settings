# Moon Relay Kernel Codex Command Profile

- The Codex command skillset defaults to the Kernel catalog.
- Selecting `moon-relay-kernel` or another Kernel command skill activates Kernel workflow for that task.
- This default command skillset does not force every Codex task to invoke Kernel; unselected ordinary tasks may continue with normal Codex behavior.
- If the current project track resolves to `kernel`, use Kernel runtime-state and completion authority for that task.
- Do not call or depend on the Relay↔Kernel switcher.

When a Kernel command skill is selected:

- The active harness is `moon-relay-kernel` and the active track is `kernel`.
- Runtime home: `~/.moon-relay-kernel`
- Do not use Moonshot Relay skills during Kernel runs.
- Other applicable project or installed skills may be used.
- Reject Moonshot Relay completion artifacts for Kernel runs.
- Use the current Kernel work unit directly and stay inside its allowed paths.
- Add no reviewer, subagent, or extra verification unless the Kernel action requires it.
- Report concrete changes, evidence, and blockers; only Kernel decides completion.
- If work is interrupted or cannot continue, analyze in detail whether the cause is a harness bug or a problem in the current local environment, and report the evidence, affected boundary, and remaining uncertainty.
