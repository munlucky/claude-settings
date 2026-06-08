# Phase 04 - Prompt/Gate Surface v1

## Purpose

Reduce prompt-level ceremony by moving duplicated evidence policy under `completion-verifier`, verification-plane logic, and runtime-state completion authority.

## Execution Metadata

```yaml
phase: 04
title: Prompt/Gate Surface
dependsOn:
  - 03-observability-contract-fields-v1
conflictsWith:
  - docs/implementation/harness-surface-simplification-2026-06-08/04-completion-verifier-surface-v1.md
ownedPaths:
  - skills/completion-verifier/SKILL.md
  - skills/completion-verifier/SKILL.ko.md
  - skills/verification-evidence-gate/SKILL.md
  - skills/verification-evidence-gate/SKILL.ko.md
  - skills/workspace-isolation-gate/SKILL.md
  - skills/workspace-isolation-gate/SKILL.ko.md
  - skills/moonshot-phase-runner/SKILL.md
  - skills/moonshot-phase-runner/SKILL.ko.md
  - skills/moonshot-orchestrator/SKILL.md
  - skills/moonshot-orchestrator/SKILL.ko.md
  - skills/moonshot-in-session-coordinator/SKILL.md
  - skills/moonshot-in-session-coordinator/SKILL.ko.md
  - rules/workflow.md
  - rules/workflow-bundles.yaml
  - tests/completion-verifier-surface-contract.test.mjs
  - tests/workflow-e2e-contract.test.mjs
  - tests/active-contracts.test.mjs
readOnlyPaths:
  - scripts/runtime-state.mjs
  - scripts/lib/verification-plane.mjs
  - schemas/verification.contract.yaml
sharedMutablePaths:
  - tests/workflow-e2e-contract.test.mjs
  - tests/active-contracts.test.mjs
adoptionTargets: []
liveMutationPolicy: source_only
```

## Implementation Contract

`completion-verifier` remains the evidence assembler. Preserve output keys:

- `completionStatus`
- `gateDecision`
- `workflowEvidence`
- `evidenceProvenance`
- `qaReport`

`completion-verifier` retains its owner map and strict evidence policy section.

`verification-evidence-gate` remains in source as a deprecated compatibility shim. It must state:

- strict evidence policy owner is `completion-verifier`, verification-plane code, and `runtime-state assess-completion`.
- new workflow defaults do not insert it directly.

`workspace-isolation-gate` becomes artifact-focused. Minimum required artifact fields:

- `branchOrWorktree`
- `prepareArtifact`
- `hydrationStatus`
- `baselineCommand`
- `baselineExitCode`
- `sandboxPolicyStatus`

Move granular checklist details such as ignored profile paths, setup command detail, and baseline log paths into prepare artifact optional/details wording.

Workflow updates:

- Remove `verification-evidence-gate` from `rules/workflow-bundles.yaml` strict insert.
- Keep `workspace-isolation-gate` in strict insert.
- Keep `verification-bundle` centered on `completion-verifier`.
- Change `rules/workflow.md` strict wording to completion-verifier evidence policy and runtime-state authority.
- English and Korean skill docs must describe the same owner policy and deprecation status.

## Acceptance Criteria

- No active bundle default inserts `verification-evidence-gate`.
- Compatibility skill still exists and points to current authority owners.
- Strict isolation remains present through `workspace-isolation-gate`.
- Completion authority wording is not repeated as long-form policy in multiple prompts; prompts call the owner.

## Verification

```powershell
node --test tests/completion-verifier-surface-contract.test.mjs tests/workflow-e2e-contract.test.mjs tests/active-contracts.test.mjs
node --test tests/verification-plane-contract.test.mjs tests/completion-authority-contract.test.mjs
rg -n "verification-evidence-gate" rules skills tests README.md docs/public
```

The `rg` result may include the skill itself, deprecated compatibility references, and tests. It must not show active bundle default insertion.
