# Phase 01 - Source Intake and Policy Mapping v1

## Objective

Pin and classify Ponytail as an external input before any Moonshot Relay source or live profile adoption.

## Dependencies

- None.

## Owned Paths

- `docs/implementation/ponytail-harness-adoption-2026-06-24/**`
- `docs/implementation/ponytail-harness-adoption-2026-06-24/planning-loop/source-intake-source-pin.json`
- `docs/implementation/ponytail-harness-adoption-2026-06-24/planning-loop/source-intake-artifact-classification.md`
- `docs/implementation/ponytail-harness-adoption-2026-06-24/planning-loop/source-intake-upstream-file-inventory.md`
- `docs/implementation/ponytail-harness-adoption-2026-06-24/planning-loop/source-intake-hook-inventory.md`
- `docs/implementation/ponytail-harness-adoption-2026-06-24/planning-loop/source-intake-policy-compatibility.md`
- `docs/implementation/ponytail-harness-adoption-2026-06-24/planning-loop/source-intake-adoption-shape-decision.yaml`

## Read-only Paths

- `AGENTS.md`
- `package/runtime-surface.json`
- `skills.lock.json`
- `schemas/skills-lock.schema.json`
- `scripts/skills-audit.mjs`
- `scripts/doctor.mjs`
- `scripts/install-account-root-harness.mjs`
- `package/package-contract.yaml`
- `docs/public/runtime-control-plane.md`

## Staged Paths

- `docs/implementation/ponytail-harness-adoption-2026-06-24/`
- `docs/implementation/ponytail-harness-adoption-2026-06-24/source-intake/`

## Execution Metadata

```yaml
phase: "01"
dependsOn: []
writeSetBoundary:
  allowed:
    - "docs/implementation/ponytail-harness-adoption-2026-06-24/**"
  conditional:
    - "docs/implementation/ponytail-harness-adoption-2026-06-24/source-intake/**"
  forbidden:
    - ".claude/**"
    - ".codex/**"
    - "package/runtime-surface.json"
    - "skills.lock.json"
    - "skills/**"
    - "scripts/install-account-root-harness.mjs"
conflicts:
  - "Any concurrent package/runtime-surface or live profile adoption work."
adoptionTarget: "external-source-intake-only"
graphReadiness: "markdown-only"
```

## Live Mutation Policy

No live profile, account-root, plugin marketplace, hook, or package mutation.

## Work Items

| ID | Work Item | Output |
|---|---|---|
| P01-1 | Pin upstream repository commit, tag/version, license, and relevant file hashes. | `planning-loop/source-intake-source-pin.json` |
| P01-2 | Classify upstream artifacts: instruction file, skills, hooks, commands, benchmark docs, and host adapters. | `planning-loop/source-intake-artifact-classification.md` and `planning-loop/source-intake-upstream-file-inventory.md` |
| P01-3 | Map Ponytail behaviors to Moonshot Relay constraints and conflicts. | `planning-loop/source-intake-policy-compatibility.md` |
| P01-4 | Decide whether first PoC should be instruction-tier only. | `planning-loop/source-intake-adoption-shape-decision.yaml` |

## Expected Evidence Artifacts

| Artifact | Required Fields |
|---|---|
| `planning-loop/source-intake-source-pin.json` | `repo`, `observedAt`, `observedRef`, `observedCommit`, `tagOrVersion`, `license`, `licenseEvidencePath`, `fetchedAt`, `reviewer`, `files[]` with `path`, `commitBoundUrl`, and `sha256` or explicit `notCopiedReason` |
| `planning-loop/source-intake-artifact-classification.md` | upstream artifact, category, executable/static status, adoption relevance, branch impact |
| `planning-loop/source-intake-upstream-file-inventory.md` | upstream file list, role, commit-bound permalink, adoption relevance, copied/reference-only decision |
| `planning-loop/source-intake-hook-inventory.md` | hook lifecycle event, executable command, arguments, env vars, filesystem writes, network use, timeout/failure behavior, disabled/adoptable verdict |
| `planning-loop/source-intake-policy-compatibility.md` | Moonshot constraint, Ponytail behavior, compatibility decision, required mitigation |
| `planning-loop/source-intake-adoption-shape-decision.yaml` | `source_pin_status`, `policy_mapping_status`, `recommended_branch`, `selected_guideline_path`, `selected_rule_path`, `selected_test_path`, `recommended_next_phase`, `phase03_blocked_reason` |

## Acceptance Criteria

- Upstream commit or release is pinned before any vendoring or managed plugin adoption.
- MIT license and attribution requirements are recorded.
- Hook files are classified as executable external code and remain disabled.
- The plan records that Ponytail can influence implementation style but cannot replace runtime-state authority, verification evidence, or closeout gates.
- Any upstream benchmark is treated as background, not local performance proof.
- Every upstream file used as planning input has either a sha256 hash of copied content or a commit-bound permalink recorded in `planning-loop/source-intake-upstream-file-inventory.md`.
- `planning-loop/source-intake-hook-inventory.md` records exact hook commands, env access, filesystem writes, timeout/failure behavior, and adoption verdict.

## Verification Signals

- `git ls-remote https://github.com/DietrichGebert/ponytail HEAD refs/tags/*`
- Hash check or commit-bound permalink evidence for every upstream file used as planning input.
- `rg -n "Ponytail|ponytail|runtime-state|runtime-surface|skills.lock" docs/implementation/ponytail-harness-adoption-2026-06-24`
- `Test-Path docs/implementation/ponytail-harness-adoption-2026-06-24/planning-loop/source-intake-source-pin.json`
- `Test-Path docs/implementation/ponytail-harness-adoption-2026-06-24/planning-loop/source-intake-hook-inventory.md`
- `Test-Path docs/implementation/ponytail-harness-adoption-2026-06-24/planning-loop/source-intake-adoption-shape-decision.yaml`

## Review-Improvement Loop

Review focus: source pin completeness, license handling, executable hook boundary, and over-claim prevention.

## Closeout Decision

Phase 02 may proceed only after source pin and policy compatibility are recorded. Phase 03 remains blocked until the adoption shape is selected.

## Expected Closeout Artifacts

- `execution/phase-01/SCORECARD.md`
- `execution/phase-01/QA_REPORT.md`
- `execution/phase-01/HANDOFF.md`
- `execution/phase-01/phase-decision.yaml`
- `planning-loop/source-intake-source-pin.json`
- `planning-loop/source-intake-artifact-classification.md`
- `planning-loop/source-intake-upstream-file-inventory.md`
- `planning-loop/source-intake-hook-inventory.md`
- `planning-loop/source-intake-policy-compatibility.md`
- `planning-loop/source-intake-adoption-shape-decision.yaml`

## Phase 01 Closeout

Status: complete

Completion evidence:

- `planning-loop/source-intake-source-pin.json`
- `planning-loop/source-intake-artifact-classification.md`
- `planning-loop/source-intake-upstream-file-inventory.md`
- `planning-loop/source-intake-hook-inventory.md`
- `planning-loop/source-intake-policy-compatibility.md`
- `planning-loop/source-intake-adoption-shape-decision.yaml`
- `execution/phase-01/SCORECARD.md`
- `execution/phase-01/QA_REPORT.md`
- `execution/phase-01/HANDOFF.md`
- `execution/phase-01/phase-decision.yaml`

Execution decision:

- Proceed to Phase 02.
- Selected first adoption branch: `instruction_tier_only`.
- Selected guideline path for Phase 02: `docs/public/guidelines/minimal-correct-implementation.md`.
- Plugin and lifecycle hooks remain disabled.
