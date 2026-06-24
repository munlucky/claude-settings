# Phase 05 - Validation, Metrics, and Rollout v1

Status: complete

## Objective

Prove the selected Ponytail adoption improves or at least does not harm Moonshot Relay development workflows before live profile rollout.

## Dependencies

- Phase 02 instruction-tier PoC.
- Phase 03 supply-chain decision.
- Phase 04 package adoption gate only when Phase 03 selected `moonshot_owned_skill`, managed hooks, or runtime-surface/package adoption.

## Owned Paths

- `tools/harness-lab/**` only if new local eval scenarios are added.
- `tests/**` for rollout regression checks.
- `docs/implementation/ponytail-harness-adoption-2026-06-24/**`
- `docs/public/**` only for finalized user-facing guidance.

## Read-only Paths

- `scripts/install-account-root-harness.mjs`
- `package/runtime-surface.json`
- `skills.lock.json`
- `docs/public/runtime-control-plane.md`
- `.moonshot-relay/**` runtime state and lab artifacts as read-only evidence unless a lab command generates new artifacts.

## Staged Paths

- Validation artifacts and tests selected by the implementation.
- `docs/implementation/ponytail-harness-adoption-2026-06-24/execution/phase-05/local-evidence-report.md`
- `docs/implementation/ponytail-harness-adoption-2026-06-24/phase-05/`

## Execution Metadata

```yaml
phase: "05"
dependsOn:
  - "02"
  - "03"
conditionalDependsOn:
  - phase: "04"
    when: "Phase 03 selects moonshot_owned_skill, managed hooks, runtime-surface expansion, or package adoption."
writeSetBoundary:
  allowed:
    - "tools/harness-lab/**"
    - "tests/**"
    - "docs/public/**"
    - "docs/implementation/ponytail-harness-adoption-2026-06-24/**"
    - ".moonshot-relay/harness-lab-runs/**"
  conditional:
    - ".moonshot-relay/harness-lab-runs/** only as generated evidence from approved lab commands"
    - "live account-root/profile paths only after explicit approval and full operational adoption closeout"
  forbidden:
    - "manual edits to runtime sqlite/state authority"
    - "live install without explicit approval"
    - "profile mutation without installed parity verification"
conflicts:
  - "Concurrent live profile sync or package rollout work."
  - "Any validation task that mutates the same harness-lab scenario files."
adoptionTarget: "rollout-decision"
graphReadiness: "markdown-only"
```

## Live Mutation Policy

Live account-root/profile mutation requires explicit approval and full operational adoption closeout evidence.

## Work Items

| ID | Work Item | Output |
|---|---|---|
| P05-1 | Select 2-3 representative Moonshot tasks where over-engineering pressure is useful. | Local eval task set. |
| P05-2 | Compare baseline vs Ponytail-influenced workflow on diff size, files touched, validation completeness, and review findings. | Local evidence report. |
| P05-3 | Confirm required safety/evidence gates remain intact. | Regression evidence. |
| P05-4 | Run full closeout gates for any managed runtime/package adoption. | Operational adoption evidence. |
| P05-5 | If approved, perform live install and installed parity checks; otherwise record "adoption skipped" decision. | Live install result or skip record. |

## Expected Evidence Artifacts

| Artifact | Required Fields |
|---|---|
| `execution/phase-05/local-evidence-report.md` | task set, baseline vs Ponytail-influenced comparison, diff/file count, validation commands and results, skipped gate audit, review finding categories |
| `phase-05/live-rollout-approval.md` | approver, exact install scope, source root, target homes, date, rollback plan; required before live install |
| `phase-05/installed-parity.json` | installer output, installed doctor result, profileSurfaceParity, representative hash parity; required after live install |
| `phase-05/rollback-manifest.yaml` | rollback command, previous manifest/hash evidence, target homes, verification commands |
| `planning-loop/phase-05-final-decision.yaml` | final branch, runtime-state completion status or `live_adoption_skipped`, accepted evidence path, residual backlog |
| `planning-loop/phase-05-adoption-skipped.md` | branch, reason, no live profile mutation statement, follow-up decision; required when live install is skipped |
| `phase-05/rejection-decision.md` | required when branch closes as `rejected` |

## Acceptance Criteria

- Local evidence does not show missing required validation, security, accessibility, or runtime-state gates.
- Complexity review findings are separated from correctness/security review findings.
- Full test/package/eval/lab gates pass before live adoption.
- Installed profile parity is verified after any live install.
- Rollback path is documented and feasible.
- `execution/phase-05/local-evidence-report.md` records at least 2 representative tasks, baseline vs Ponytail-influenced diff/file counts, validation commands, and review finding categories.
- No required security, accessibility, runtime-state, package, or closeout gate is skipped; any not-applicable gate has a branch-specific reason.
- Live install cannot run without `phase-05/live-rollout-approval.md`.
- If live install is skipped, `planning-loop/phase-05-adoption-skipped.md` replaces installed parity evidence.
- Final closeout records either accepted runtime-state completion evidence or explicit `live_adoption_skipped` in `planning-loop/phase-05-final-decision.yaml`.

## Verification Signals

- `npm run test:lab`
- `npm run test:package`
- `npm run test:eval`
- `npm test`
- `node package/build-package.mjs --runtime all --dry-run --json`
- If live adoption occurs: installed `doctor` with explicit `--repo-root`, `--lock`, and `--runtime-surface` paths plus installer `profileSurfaceParity`.
- `Test-Path docs/implementation/ponytail-harness-adoption-2026-06-24/execution/phase-05/local-evidence-report.md`
- `Test-Path docs/implementation/ponytail-harness-adoption-2026-06-24/phase-05/live-rollout-approval.md` before live install.
- `Test-Path docs/implementation/ponytail-harness-adoption-2026-06-24/phase-05/installed-parity.json` after live install, or `Test-Path docs/implementation/ponytail-harness-adoption-2026-06-24/planning-loop/phase-05-adoption-skipped.md` when skipped.
- `Test-Path docs/implementation/ponytail-harness-adoption-2026-06-24/planning-loop/phase-05-final-decision.yaml`

## Review-Improvement Loop

Review focus: local evidence quality, false economy risks, and whether live adoption is worth the new maintenance surface.

## Closeout Decision

Close as one of:

- `instruction_tier_only`: guideline/rubric adopted, no runtime surface expansion.
- `managed_skill_adopted`: Moonshot-owned skill adopted through lock/package/profile gates.
- `user_managed_plugin_documented`: upstream Ponytail plugin remains opt-in outside Moonshot Relay package authority.
- `rejected`: local evidence or supply-chain review does not justify adoption.

Selected closeout: `instruction_tier_only`.

## Expected Closeout Artifacts

- `execution/phase-05/SCORECARD.md`
- `execution/phase-05/QA_REPORT.md`
- `execution/phase-05/HANDOFF.md`
- `execution/phase-05/local-evidence-report.md`
- `phase-05/live-rollout-approval.md` and `phase-05/installed-parity.json` if live adoption occurs
- `phase-05/rollback-manifest.yaml` if live adoption occurs
- `planning-loop/phase-05-final-decision.yaml`
- `planning-loop/phase-05-adoption-skipped.md` if live adoption is skipped
- `phase-05/rejection-decision.md` if rejected

## Phase 05 Closeout

Final branch: `instruction_tier_only`.

Live adoption is skipped. The adopted durable source is `docs/public/guidelines/minimal-correct-implementation.md` plus the public guideline classification entry in `docs/public/repository-layout.md`.

Closeout artifacts:

- `execution/phase-05/local-evidence-report.md`
- `planning-loop/phase-05-adoption-skipped.md`
- `planning-loop/phase-05-final-decision.yaml`
- `execution/phase-05/SCORECARD.md`
- `execution/phase-05/QA_REPORT.md`
- `execution/phase-05/HANDOFF.md`
- `execution/phase-05/phase-decision.yaml`

Verification:

- `npm run test:lab` passed.
- `npm run test:eval` passed 14/14 golden cases.
- `npm run test:package -- --runInBand` passed 40 tests.
- `npm test` passed 327 tests with 1 skipped after adding the public guideline classification entry.
- `node scripts/doctor.mjs check --json` returned `status: pass`.
- `node scripts/skills-audit.mjs audit --lock skills.lock.json --runtime-surface package/runtime-surface.json --json` returned `status: pass`.
