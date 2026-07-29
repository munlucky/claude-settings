# Moon Relay Kernel — Codex Repository Contract

Durable repository guidance for Codex sessions on a Kernel track. Loaded on
every session, so it stays short. Execution settings are decided per turn by the
Host and are deliberately absent from this file.

## Repository Structure

- `bin/` — CLI entrypoints (`moon-relay-kernel.mjs`, `moonshot-relay.mjs`).
- `scripts/kernel/` — Kernel core: contract, capsule, evidence, knowledge, state.
- `scripts/host/kernel/` — Host side: prompt envelope, provider policies, adapters.
- `schemas/` — published contract schemas.
- `tests/` — `node --test` suites; the active suite is defined in `package.json`.

## Commands

```bash
npm test                  # full active suite
npm run test:kernel       # Kernel suites only
npm run test:routing      # provider routing and profile contracts
node bin/moon-relay-kernel.mjs doctor
```

## Engineering Constraints

- The Kernel core stays provider-neutral: no provider model id, SDK, endpoint,
  or credential below `scripts/kernel/`.
- Unmeasured telemetry is `null`, never `0`.
- Schema and database migrations are additive.
- Changes stay inside the current work unit's declared paths.

## Do Not

- Do not edit the user's global Codex configuration; Kernel profiles are
  materialized under the Kernel runtime home.
- Do not weaken Route Admission, Review Receipt independence, or the Kernel's
  completion authority to make a check pass.
- Do not run verification commands as a substitute for Kernel evidence.

## Done and Verification

Work is done when the Kernel returns the `done` action. Name the verification
commands for the current obligation; the Kernel runtime executes them and owns
the result. Detailed planning, review, and architecture procedure lives in the
Kernel skills, not in this file.
