# Phase 03 - Skill and Plugin Supply Chain v1

Status: complete

## Objective

Decide whether Moonshot Relay should own a Ponytail-derived skill, reference the upstream plugin as user-managed, or keep the adoption instruction-tier only.

## Dependencies

- Phase 01 source pin.
- Phase 02 instruction-tier PoC result.

## Owned Paths

- `skills/**` only if a Moonshot-owned skill is explicitly selected.
- `skills.lock.json`
- `schemas/skills-lock.schema.json` only if the current schema cannot represent the selected adoption.
- `scripts/lib/skills-lock.mjs`
- `scripts/skills-audit.mjs`
- `tests/skills-doctor-contract.test.mjs`
- `tests/**` for new plugin/supply-chain tests.
- `docs/implementation/ponytail-harness-adoption-2026-06-24/**`

## Read-only Paths

- `package/runtime-surface.json`
- `package/package-contract.yaml`
- `scripts/install-account-root-harness.mjs`
- `docs/public/repository-layout.md`
- Upstream pinned Ponytail files from Phase 01.

## Staged Paths

- Selected supply-chain files and tests.
- `docs/implementation/ponytail-harness-adoption-2026-06-24/phase-03/`

## Execution Metadata

```yaml
phase: "03"
dependsOn:
  - "01"
  - "02"
writeSetBoundary:
  allowed:
    - "docs/implementation/ponytail-harness-adoption-2026-06-24/**"
  conditional:
    - "instruction_tier_only: docs/implementation/ponytail-harness-adoption-2026-06-24/** only"
    - "moonshot_owned_skill: skills/**, skills.lock.json, tests/**"
    - "user_managed_plugin_documented: docs/public/** only if external opt-in docs are selected"
    - "schemas/skills-lock.schema.json, scripts/lib/skills-lock.mjs, scripts/skills-audit.mjs only when current lock schema cannot represent the selected policy"
  forbidden:
    - ".claude/**"
    - ".codex/**"
    - "package/runtime-surface.json unless Phase 04 explicitly approves runtime-surface adoption"
    - "live plugin installation paths"
conflicts:
  - "Concurrent skill lock regeneration or runtime-surface allowlist changes."
  - "Any external plugin/hook installation outside reviewed supply-chain boundaries."
adoptionTarget: "supply-chain-decision"
graphReadiness: "markdown-only"
```

## Live Mutation Policy

No live profile or account-root mutation. External plugin installation remains user-managed unless Phase 04 explicitly changes package policy.

## Work Items

| ID | Work Item | Output |
|---|---|---|
| P03-1 | Compare three adoption shapes: instruction-tier only, Moonshot-owned minimality skill, user-managed upstream plugin. | Adoption decision record. |
| P03-2 | If a Moonshot-owned skill is selected, create a narrow skill with Moonshot safety exclusions and source attribution. | `skills/<selected-name>/SKILL.md` plus lock update. |
| P03-3 | If upstream plugin reference is selected, record it as external/user-managed rather than package-managed. | External plugin note or lock extension proposal. |
| P03-4 | Review executable hook permissions and whether current supply-chain schema can represent them. | Permission review result. |
| P03-5 | Add tests for any lock/schema/audit behavior changed by this phase. | Contract tests. |

## Expected Evidence Artifacts

| Artifact | Required Fields |
|---|---|
| `phase-03/adoption-decision.yaml` | `branch` as one of `instruction_tier_only`, `moonshot_owned_skill`, `user_managed_plugin_documented`, `rejected`; rationale; owned files; rollback steps; `requires_phase_04`; reviewer |
| `phase-03/permission-review.md` | executable path, arguments, env vars, network use, filesystem writes, process lifetime, timeout/failure behavior, package-policy representation, verdict |
| `phase-03/skills-audit.json` | output of `node scripts/skills-audit.mjs audit --lock skills.lock.json --runtime-surface package/runtime-surface.json --json` |
| `phase-03/lock-update-decision.md` | exact lock regeneration command and result, or explicit `no-regeneration-allowed` reason for non-skill branches |

## Acceptance Criteria

- Adoption shape is explicit and reversible.
- `skills.lock.json` has no hash drift after any source skill change.
- Any external executable hook is either blocked from managed adoption or covered by a reviewed permission model.
- `package/runtime-surface.json` is unchanged unless explicit approval is recorded.
- `doctor` and `skills-audit` do not regress.
- `phase-03/adoption-decision.yaml` names the selected branch, rollback steps, owned files, and whether Phase 04 is required.
- `phase-03/permission-review.md` exists even when hooks are rejected, with a clear rejected or not-applicable verdict.
- Non-skill branches explicitly record that `skills.lock.json` regeneration is not allowed.

## Verification Signals

- `node scripts/skills-audit.mjs audit --lock skills.lock.json --runtime-surface package/runtime-surface.json --json`
- `node scripts/doctor.mjs check --json`
- `Test-Path docs/implementation/ponytail-harness-adoption-2026-06-24/phase-03/adoption-decision.yaml`
- `Test-Path docs/implementation/ponytail-harness-adoption-2026-06-24/phase-03/permission-review.md`
- If a skill is added: `node scripts/skills-audit.mjs generate-lock --out skills.lock.json --default-license MIT --default-permissions-json [] --approve-permissions --json` followed by the audit command above.
- Targeted `node --test` command for updated supply-chain tests.

## Review-Improvement Loop

Review focus: whether owning a skill creates more maintenance than value, and whether external hooks are being smuggled into trusted runtime paths.

## Closeout Decision

Do not proceed to active Phase 04 implementation. Package/runtime adoption is no longer desired after supply-chain review.

## Expected Closeout Artifacts

- `execution/phase-03/SCORECARD.md`
- `execution/phase-03/QA_REPORT.md`
- `execution/phase-03/HANDOFF.md`
- `phase-03/adoption-decision.yaml`
- `phase-03/permission-review.md`
- `phase-03/skills-audit.json`
- `phase-03/lock-update-decision.md`

## Phase 03 Closeout

Selected branch: `instruction_tier_only`.

Phase 03 rejects managed adoption of Ponytail plugin, skill, and executable hook surfaces. The adopted behavior remains the public guideline created in Phase 02.

Closeout artifacts:

- `phase-03/adoption-decision.yaml`
- `phase-03/permission-review.md`
- `phase-03/skills-audit.json`
- `phase-03/lock-update-decision.md`
- `execution/phase-03/SCORECARD.md`
- `execution/phase-03/QA_REPORT.md`
- `execution/phase-03/HANDOFF.md`
- `execution/phase-03/phase-decision.yaml`

Verification:

- `node scripts/skills-audit.mjs audit --lock skills.lock.json --runtime-surface package/runtime-surface.json --json` returned `status: pass`.
- `node scripts/doctor.mjs check --json` returned `status: pass`.
