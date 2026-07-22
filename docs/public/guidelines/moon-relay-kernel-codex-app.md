# Moon Relay Kernel Codex App Boundary

The Kernel product is selected by the current project, not by the repository that contains the installed catalog.

- Resolve `.moon-relay/track.yaml` from the project working directory and its parents.
- Keep the Kernel catalog and runtime home separate from Relay.
- Refuse Kernel mutation commands when the active project track is not `kernel`.
- Treat profile and account-root adoption as a separate, evidence-gated operation.

The durable implementation owners are `scripts/kernel/runtime-home.mjs`, `scripts/skill-router.mjs`, `bin/moon-relay-kernel.mjs`, and the Kernel profile package.
