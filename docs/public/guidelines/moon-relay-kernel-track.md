# Moon Relay Kernel Track

`main` remains the Moonshot Relay stable track. `kernel/moon-relay-kernel` is an isolated experimental product track.

- Relay runtime home: `~/.moonshot-relay`
- Kernel runtime home: `~/.moon-relay-kernel`
- Project/worktree selection: account-root `state/track-scopes/<scope>.json`, keyed by canonical project root plus Git common/worktree identity
- Repository `.moon-relay/track.yaml`: legacy compatibility marker only; new Kernel binding must not require or create it
- Runtime DB, profile manifest, skill lock, cache, logs, and completion state must not be shared.
- Main-to-Kernel sync is limited to reviewed security, installer, managed-runtime, data-integrity, and cross-platform fixes.
- Kernel workflow and prompt changes never merge automatically into Relay.
- Live profile adoption requires disposable-home package, doctor, routing, eval, lab, rollback, and uninstall evidence.
