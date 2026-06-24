# Phase 02 - Instruction-Tier PoC v1

## Objective

Create a source-only Moonshot-specific minimality guideline or rubric based on Ponytail's ladder, without adding upstream hooks or runtime skills.

## Dependencies

- Phase 01 source pin and policy mapping.

## Owned Paths

- `docs/public/guidelines/**` for public guideline candidates.
- `rules/**` only if a narrow agent-rule update is explicitly selected.
- `tests/**` for contract checks that protect required evidence wording.
- `docs/implementation/ponytail-harness-adoption-2026-06-24/**`

## Read-only Paths

- `AGENTS.md`
- `rules/agents/agent-definition.md`
- `rules/skills/skill-definition.md`
- `skills/moonshot-plan-writer/SKILL.md`
- `skills/moonshot-phase-runner/SKILL.md`
- `skills/commit-moonshot/SKILL.md`
- `docs/public/runtime-control-plane.md`
- `schemas/verification.contract.yaml`

## Staged Paths

- Exact candidate guideline, rule, and test paths selected in `source-intake/adoption-shape-decision.yaml`.
- Targeted test file or documented static gate output.
- `docs/implementation/ponytail-harness-adoption-2026-06-24/execution/phase-02/minimality-static-gate.txt`

## Execution Metadata

```yaml
phase: "02"
dependsOn:
  - "01"
writeSetBoundary:
  allowed:
    - "docs/public/guidelines/**"
    - "rules/**"
    - "tests/**"
    - "docs/implementation/ponytail-harness-adoption-2026-06-24/**"
  conditional:
    - "rules/** only when Phase 01 selects a rule-level PoC instead of guideline-only PoC"
  forbidden:
    - ".claude/**"
    - ".codex/**"
    - "package/runtime-surface.json"
    - "skills.lock.json"
    - "skills/**"
conflicts:
  - "Concurrent edits to the same public guideline or rule files."
  - "Any runtime-surface expansion that has not passed Phase 03 and Phase 04."
adoptionTarget: "instruction-tier-source-only"
graphReadiness: "markdown-only"
```

## Live Mutation Policy

No live profile, account-root, plugin, hook, or runtime-surface mutation.

## Work Items

| ID | Work Item | Output |
|---|---|---|
| P02-1 | Translate the Ponytail ladder into Moonshot terms: do not build, reuse local pattern, stdlib/platform, existing dependency, then minimal code. | Draft guideline/rubric. |
| P02-2 | Add explicit safety exclusions for Moonshot gates: validation, evidence, security, accessibility, package boundaries, runtime-state authority. | Safety-preserving wording. |
| P02-3 | Add review checklist items for "complexity-only" findings. | Optional review rubric. |
| P02-4 | Add a focused test or documented static gate that prevents replacing required evidence wording with minimalism-only language. | Contract test or `execution/phase-02/minimality-static-gate.txt`. |

## Expected Evidence Artifacts

| Artifact | Required Fields |
|---|---|
| `execution/phase-02/HANDOFF.md` | selected guideline/rule path, adoption type, why `rules/**` was or was not touched, next branch recommendation |
| `execution/phase-02/phase-decision.yaml` | `next` as `phase03`, `close_instruction_tier_only`, or `blocked`; `evidence.no_runtime_surface_changed`; selected paths |
| `execution/phase-02/minimality-static-gate.txt` | command, checked paths, required safety terms, pass/fail result |
| `execution/phase-02/no-dependency-diff.txt` | `git diff -- package.json package-lock.json npm-shrinkwrap.json pnpm-lock.yaml yarn.lock skills.lock.json package/runtime-surface.json` result or explicit no-change statement |

## Acceptance Criteria

- The PoC does not expand `package/runtime-surface.json`.
- The PoC does not add a new dependency.
- The PoC explicitly says minimality applies after reading the affected code and tracing real flow.
- The PoC preserves non-negotiable verification and closeout gates.
- Any copied wording is license-attributed or rewritten as Moonshot-specific guidance.
- A mandatory test or documented static gate proves the PoC did not weaken evidence, security, accessibility, runtime-state, or closeout language.
- `execution/phase-02/HANDOFF.md` names the selected path and records why `rules/**` was or was not changed.
- Dependency and runtime-surface files are unchanged, or the exact diff is recorded as an explicit exception.

## Verification Signals

- `rg -n "minimal|YAGNI|stdlib|runtime-state|verification|security|accessibility" <selected-guideline-or-rule-path>`
- `node scripts/doctor.mjs check --json`
- `Test-Path docs/implementation/ponytail-harness-adoption-2026-06-24/execution/phase-02/minimality-static-gate.txt`
- `git diff -- package.json package-lock.json npm-shrinkwrap.json pnpm-lock.yaml yarn.lock skills.lock.json package/runtime-surface.json`

## Review-Improvement Loop

Review focus: whether the guideline is small enough to be useful and strong enough not to weaken evidence requirements.

## Closeout Decision

If instruction-tier guidance is enough, Phase 03 may close with "managed skill/plugin adoption skipped." If a reusable skill or plugin path is still desired, Phase 03 proceeds.

## Expected Closeout Artifacts

- `execution/phase-02/SCORECARD.md`
- `execution/phase-02/QA_REPORT.md`
- `execution/phase-02/HANDOFF.md`
- `execution/phase-02/phase-decision.yaml`
- `execution/phase-02/minimality-static-gate.txt`
- `execution/phase-02/no-dependency-diff.txt`

## Phase 02 Closeout

Status: complete

Completion evidence:

- `docs/public/guidelines/minimal-correct-implementation.md`
- `execution/phase-02/SCORECARD.md`
- `execution/phase-02/QA_REPORT.md`
- `execution/phase-02/HANDOFF.md`
- `execution/phase-02/phase-decision.yaml`
- `execution/phase-02/minimality-static-gate.txt`
- `execution/phase-02/no-dependency-diff.txt`

Execution decision:

- Proceed to Phase 03.
- Branch remains `instruction_tier_only`.
- No managed skill, plugin, hook, runtime-surface, dependency, or live profile adoption occurred.
