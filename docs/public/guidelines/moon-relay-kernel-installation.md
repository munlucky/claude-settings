# Moon Relay Kernel Installation

Kernel installation owns only files recorded in its per-file manifest under the target project's `.moon-relay` directory.

- A Relay marker is protected and cannot be overwritten by Kernel installation.
- Existing Kernel-owned files are checksum-verified before replacement or removal.
- Installation snapshots replaced files before mutation and rollback restores only that snapshot.
- Uninstall stops on checksum collisions and never removes unowned Relay or profile/runtime data.
- Package payloads, managed runtime files, and profiles must remain inside the contained Kernel payload root.
- An optional `--runtime-source` is normalized into `kernel-payload/runtime/current`; the installer writes a resolver-compatible manifest bound to the copied Node binary.

The durable implementation owner is `scripts/kernel/installer.mjs`; package planning and materialization remain in `scripts/kernel/package-build.mjs`.
