# Phase 01 - Product Readiness Doctor v1

## Metadata

```yaml
phase:
  id: "01"
  title: Product Readiness Doctor
  status: source_first_ready
  dependsOn: []
  surfaceClassification:
    - source_only
  ownedPaths:
    - scripts/doctor.mjs
    - tests/skills-doctor-contract.test.mjs
    - docs/public/reference/runtime-skill-surface.md
    - docs/implementation/harness-product-readiness-kernel-2026-06-30/**
  readOnlyPaths:
    - package/runtime-surface.json
    - skills.lock.json
    - .moonshot-relay/harness-lab/**
    - .moonshot-relay/docs/research/**
    - package.json
  writeSetBoundary: "Source files and tests only. Generated readiness evidence may be read but not normalized by mutation."
  liveMutationPolicy: "No live account-root/profile mutation."
  policySources:
    - AGENTS.md
    - package.json
    - docs/public/repository-layout.md
    - docs/public/reference/runtime-skill-surface.md
```

## Goal

Extend `scripts/doctor.mjs` from a runtime-surface and skills-lock guard into a product readiness surface. The doctor must answer whether an operator can trust the current checkout/profile/lab/research surfaces, without becoming promotion authority.

## Doctor JSON Contract

Required top-level shape:

```json
{
  "schemaVersion": "moonshot-doctor-readiness.v1",
  "status": "pass | degraded | review_required | blocked",
  "checks": {
    "runtimeSurface": {},
    "skillsLock": {},
    "labReadiness": {},
    "evalReadiness": {},
    "researchReadiness": {},
    "profileTrust": {},
    "generatedStateBoundary": {}
  },
  "findings": []
}
```

Status rules:

- `blocked`: runtime surface expanded without approval, skills lock missing or hash drift, generated state appears in package payload, or configured hard gate fails.
- `review_required`: permission/license review gaps or stale but usable evidence.
- `degraded`: optional readiness evidence is missing, stale, or unavailable.
- `pass`: all required checks pass and optional checks are either healthy or explicitly not requested.

Doctor must not report `improvement`, `promotable`, or `commit-consumable`. Those remain lab closeout concepts.

Aggregation and exit-code rules:

| Highest finding severity | Optional-readiness state | Top-level status | Exit code |
| --- | --- | --- | --- |
| `blocking` present | any | `blocked` | `2` |
| no `blocking`, `review` present | any | `review_required` | `0` |
| no `blocking` or `review` | any required subcheck `degraded` | `degraded` | `0` |
| no `blocking` or `review` | only optional subchecks `not_available` or `stale` | `degraded` | `0` |
| no findings | all requested subchecks healthy/pass | `pass` | `0` |

`findings[].severity` vocabulary is `blocking`, `review`, `degraded`, and `info`. Missing optional lab/eval/research evidence is `degraded` or `info`, not `blocking`, unless the operator explicitly requests a required subcheck flag such as future `--lab-required`.

## Subchecks

| Check | Source | Required Behavior |
| --- | --- | --- |
| `runtimeSurface` | `package/runtime-surface.json` | preserve current expansion guard |
| `skillsLock` | `skills.lock.json` | preserve current hash/license/permission audit |
| `labReadiness` | `.moonshot-relay/harness-lab/baselines/current.json`, latest `candidate-summary.json`, latest `lab-closeout-receipt.json` | report `ready`, `not_initialized`, `stale`, or `degraded`; do not run Docker |
| `evalReadiness` | latest available eval artifact or optional `npm run test:eval` handoff evidence | report last score/fail count when present; missing evidence is `not_available` |
| `researchReadiness` | research fixture configuration and latest fixed fixture output | report optional collector status, boundary/access reporting, and empty-evidence regression status |
| `profileTrust` | source checkout and optional explicit installed root inputs | source mode is default; installed mode requires explicit paths |
| `generatedStateBoundary` | package payload and generated state exclusion rules | fail if generated lab/research/sqlite/log/verdict payload is selected for package inclusion |

## Acceptance Criteria

| ID | Criterion | Evidence |
| --- | --- | --- |
| P01-AC1 | Existing doctor CLI behavior remains backward compatible for `node scripts/doctor.mjs check --json`. | targeted contract test |
| P01-AC2 | New JSON schema includes all required product readiness subchecks. | `tests/skills-doctor-contract.test.mjs` |
| P01-AC3 | Missing lab/eval/research evidence produces `degraded` or `not_available`, not false `pass`. | fixture test |
| P01-AC4 | Runtime surface expansion and skills-lock blocking behavior remain unchanged. | existing doctor tests |
| P01-AC5 | Doctor docs state that improvement and commit consumption belong to harness-lab closeout, not doctor. | doc keyword audit |

## Validation Gates

Supporting check:

```powershell
node --test tests/skills-doctor-contract.test.mjs
```

Required gates:

```powershell
node scripts/doctor.mjs check --json
node scripts/skills-audit.mjs audit --lock skills.lock.json --runtime-surface package/runtime-surface.json --json
```

Run `npm run test:lab` after implementation because doctor now reads lab readiness artifacts, but do not treat it as improvement proof.

## Open Risks

- A doctor that auto-runs expensive lab/research commands would become an operator action, not a readiness read. Default implementation must be read-only.
- Installed profile trust can drift; explicit installed-root mode must be opt-in and separately evidenced.
