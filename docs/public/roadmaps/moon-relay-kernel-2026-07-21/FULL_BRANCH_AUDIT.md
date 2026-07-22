# Moon Relay Kernel Frozen Remediation Audit

Date: 2026-07-22

This artifact records the revalidation boundary for `KRN-AUD-P0-01` through `KRN-AUD-P0-06` and `KRN-AUD-P1-01` through `KRN-AUD-P1-09`. No new audit item is introduced.

## Source remediation evidence

- Completion authority evaluates only the latest verification row per obligation, requires PROVE-state recording, checks acceptance coverage, approved waiver receipts, E2 release evidence, current mutation revision, and the trusted run source identity.
- Control Plane returns the prompt and receipt together, uses the effective Kernel runtime home, projects state on mutation, and keeps status read-only.
- Kernel routing reads the project track from `projectRoot`; CLI mutation commands hard-stop on a non-Kernel track.
- Managed Node child execution propagates its exit status and never retries a failed child command on host Node.
- Installer owns a contained Kernel payload with per-file checksums, backup snapshots, collision detection, rollback restoration, and checksum-protected uninstall. Relay markers are protected.
- Context truncation updates receipt inclusion to match the prompt, and Evidence Pack task contracts use `objective`, `acceptance`, `scope`, `nonGoals`, and `riskTier`.
- SQLite enables foreign-key enforcement and exposes lease, attempt, waiver, evidence-lineage, and evidence-pack persistence APIs.
- CI remains unchanged; this remediation does not add a new CI product surface.

## Fresh verification boundary

Fresh local verification on Node v24.18.0 is green: `npm run test:kernel` passed 57/57, `npm test` passed 667 with 1 skipped and 0 failed, `npm run test:package` passed 139/139, `npm run test:routing` passed 22/22, and `npm run test:eval` passed 14/14. The harness lab candidate smoke also passed with account-root guards unchanged, but correctly remained `smoke_only` because no baseline comparison was supplied.

The disposable installed launcher E2E passed start-run, state transitions, proof, close/status acceptance, checksum-protected uninstall, actual managed Node `runtime/current` launcher resolution, and reinstallation rollback in a temporary project. Only managed-runtime multi-version execution remains a separate evidence gate. Live account-root/profile adoption is intentionally excluded from this source remediation and remains a later manual user test.

The independent re-review identified the installer runtime wiring and projection-consumer boundary. Both are now implemented: external runtime sources are materialized under the contained payload's `runtime/current` contract with a generated checksum manifest, and verification reads the atomic projection bundle before accepting legacy projections. The target-root uninstall track guard was also fixed and covered by a regression test.

## Frozen disposition

The previous commit message is not used as evidence. Traceability remains conservative (`partial`) only for the managed-runtime multi-version matrix; local source, installer, rollback, bundle, and installed-product gates are now evidenced in this audit.
