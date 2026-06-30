# Runtime Skill Surface

`package/runtime-surface.json` is the single authority for Claude/Codex profile-local runtime skill discovery.

Profile-local public runtime skills:

- `product-orchestrator`
- `moonshot-architecture`
- `moonshot-orchestrator`
- `moonshot-phase-runner`
- `moonshot-plan-writer`
- `commit-moonshot`
- `session-logger`

The shared common payload preserves canonical `skills/**` for internal support and source parity. `moonshot-plan-writer` is a user-invoked planning entrypoint and must remain installed into Claude/Codex profile-local public discovery.

## Architecture Handoff Route

Use `product-orchestrator` while the request is still product scope. When product work becomes architecture-heavy, route through `moonshot-architecture` and pass architecture package paths forward instead of inline summaries.

`moonshot-plan-writer` consumes accepted architecture package paths and maps selected `ADR/*.md`, `TRACEABILITY_MATRIX.md`, and `ARCHITECTURE_REVIEW.md` rows into phase metadata, owners, verification signals, and acceptance evidence.

`moonshot-orchestrator` consumes a bounded selected ADR and traceability slice. `moonshot-phase-runner` consumes multi-phase, staged adoption, or long-running architecture-derived plan packages.

Controlled adoption remains source-first: package dry-run and installer dry-run must pass before account-root or profile sync mutates live runtime files.

For harness/package/profile changes, live adoption also requires the regular Operational Adoption Closeout: independent completion audit, independent operational adoption audit, source `node scripts/doctor.mjs check --json`, `node scripts/skills-audit.mjs audit --lock skills.lock.json --runtime-surface package/runtime-surface.json --json`, `npm run test:lab`, `npm run test:package`, `npm run test:eval`, `npm test`, `node package/build-package.mjs --runtime all --dry-run --json`, live `node bin/moonshot-relay.mjs install --runtime all --json`, installed doctor pass with explicit installed `--repo-root`, `--lock`, and `--runtime-surface` paths, and installer JSON `profileSurfaceParity[runtime=codex].extraCanonicalCount=0` for Codex managed canonical pruning.

## Product Readiness Doctor

`node scripts/doctor.mjs check --json` emits `schemaVersion: moonshot-doctor-readiness.v1` and keeps the existing CLI flags for source and explicit payload-root checks. The readiness schema includes `runtimeSurface`, `skillsLock`, `labReadiness`, `evalReadiness`, `researchReadiness`, `profileTrust`, and `generatedStateBoundary`.

The doctor is a read-only trust surface. It summarizes existing lab, eval, and research artifacts when present, reports missing or stale optional evidence as degraded readiness, and exits `2` only for blocking findings such as runtime surface expansion, skills-lock/hash failures, hard gate failures, or generated state selected into package payload.

The doctor does not decide improvement status or whether source changes are consumable by Git/commit workflows. Those decisions remain harness-lab closeout and repository closeout responsibilities.
