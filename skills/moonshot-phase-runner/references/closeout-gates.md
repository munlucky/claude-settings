# Closeout Gates

Phase completion requires agreement between source-plan conformance, verifier evidence, scorecard status, QA report, and handoff state.

## Required Signals

- Source plan conformance passed for the phase artifact set.
- Required verification commands are fresh after the last relevant edit.
- `SCORECARD.md` marks objective conformance as pass.
- `QA_REPORT.md` records the verification result and residual risks.
- `HANDOFF.md` is either not required or contains concrete continuation steps.
- Whole-plan success also requires final repository closeout evidence.

## Operational Adoption Closeout

Run this gate before any live account-root, `.claude/**`, or `.codex/**` profile mutation. Source checkout evidence must pass before live adoption starts.

Required pre-adoption evidence:

- Independent completion audit from a fresh reviewer or agent.
- Independent operational adoption audit from a separate fresh reviewer or agent.
- `node scripts/doctor.mjs check --json` returns `status=pass`.
- `node scripts/skills-audit.mjs audit --lock skills.lock.json --runtime-surface package/runtime-surface.json --json` has no blocking finding.
- `npm run test:lab` passes.
- `npm run test:package` passes.
- `npm run test:eval` passes.
- `npm test` passes.
- `node package/build-package.mjs --runtime all --dry-run --json` passes.

Live adoption evidence, when adoption is explicitly in scope:

- `node bin/moonshot-relay.mjs install --runtime all --json` completes and records an `installId`.
- Installed doctor is run against the installed common payload, not the source checkout:
  - PowerShell: `node "$env:MOONSHOT_RELAY_HOME\scripts\doctor.mjs" check --repo-root "$env:MOONSHOT_RELAY_HOME" --lock "$env:MOONSHOT_RELAY_HOME\skills.lock.json" --runtime-surface "$env:MOONSHOT_RELAY_HOME\package\runtime-surface.json" --json`
  - bash/zsh: `node "${MOONSHOT_RELAY_HOME:-$HOME/.moonshot-relay}/scripts/doctor.mjs" check --repo-root "${MOONSHOT_RELAY_HOME:-$HOME/.moonshot-relay}" --lock "${MOONSHOT_RELAY_HOME:-$HOME/.moonshot-relay}/skills.lock.json" --runtime-surface "${MOONSHOT_RELAY_HOME:-$HOME/.moonshot-relay}/package/runtime-surface.json" --json`
- Installer JSON `profileSurfaceParity[]` reports Claude and Codex profile-local public skill parity against `package/runtime-surface.json`.
- Codex canonical managed skill pruning has `profileSurfaceParity[runtime=codex].extraCanonicalCount=0`.
- Verification records the installed profile paths checked and any preserved state roots.

Repository closeout evidence:

- `commit-moonshot` is used when commit/push closeout is requested.
- Filtered staging excludes generated state and account-root knowledge state.
- Commit and push outcomes are recorded through the commit closeout event helper.
- `HEAD == origin/<branch>` is verified after push when remote publication is requested.
