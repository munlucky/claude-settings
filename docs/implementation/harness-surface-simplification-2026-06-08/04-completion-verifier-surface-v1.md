# Phase 04: Completion Verifier Surface (v1)

## Source Mapping

| Req ID | Source Section | Requirement Summary | This Phase Handling |
|--------|----------------|---------------------|---------------------|
| SRC-4 | Harness surface plan | Decompose overloaded completion-verifier prompt | Converts skill into verifier assembler and moves detailed workflow evidence policy to guidelines/tests |

## Goal

Reduce `completion-verifier` prompt surface while preserving authority rules, output shape, workflow evidence expectations, and bilingual profile behavior.

## Expected Outcome

`completion-verifier` becomes a compact verifier assembler that points to code/schema/guideline owners instead of duplicating every completion policy inline.

## Phase Execution Metadata

```yaml
phaseExecution:
  schemaVersion: 1
  parallelEligible: false
  parallelGroup: wave-3
  dependsOn:
    - 03-task-local-completion-read-model-v1
  conflictsWith: []
  ownedPaths:
    - skills/completion-verifier/SKILL.md
    - skills/completion-verifier/SKILL.ko.md
    - docs/public/guidelines/verification-workflow-evidence.md
    - docs/public/guidelines/verification-workflow-evidence.ko.md
    - docs/public/repository-layout.md
    - tests/completion-verifier-surface-contract.test.mjs
    - tests/active-contracts.test.mjs
  readOnlyPaths:
    - scripts/runtime-state.mjs
    - scripts/lib/runtime-state-store.mjs
    - scripts/verification-plane.mjs
    - scripts/lib/verification-plane.mjs
    - schemas/verification.contract.yaml
    - tests/verification-plane-contract.test.mjs
    - tests/completion-authority-contract.test.mjs
    - tests/workflow-e2e-contract.test.mjs
  sharedMutablePaths:
    - docs/public/repository-layout.md
    - tests/active-contracts.test.mjs
  requiresManualEvidence: false
  mergePolicy: coordinated_shared_docs_tests
```

## Scope

- In scope:
  - Add workflow evidence guideline in English and Korean.
  - Add surface contract tests for output keys and owner references.
  - Rewrite completion-verifier docs as assembler instructions.
- Out of scope:
  - Changing verification plane semantics.
  - Changing `assess-completion` accepted/rejected logic.
  - Adding a new public skill.

## Preconditions and Inputs

- Required docs:
  - `00-master-plan-v1.md`
  - `03-task-local-completion-read-model-v1.md`
- Required code/data:
  - Current `completion-verifier` output sections and existing authority tests.

## Detailed Tasks

| ID | Task | Steps | Done Criteria |
|----|------|-------|---------------|
| P04-1 | Add surface RED tests | Create or extend tests requiring owner references and output skeleton keys: `completionStatus`, `gateDecision`, `workflowEvidence`, `evidenceProvenance`, `qaReport` | Tests fail before rewrite |
| P04-2 | Create workflow evidence guideline | Move workflow evidence, review/finish bundle, traceability, score, CRG selected/skipped, UAT ready/complete policy into guideline pair | Guidelines are classified |
| P04-3 | Rewrite verifier skills | Keep role, inputs, execution order, owner map, pass/fail prohibitions, and output skeleton; remove duplicated long policy lists | Skill docs shorter and linked |
| P04-4 | Preserve bilingual parity | Align `.md` and `.ko.md` owner references and output semantics | Parity tests pass |

## Critical Product Scenarios

| ID | User-Visible Expectation | Verification Command | Expected Signal | Evidence Path |
|----|--------------------------|----------------------|-----------------|---------------|
| SCN-04-1 | Verifier prompt shrinks without losing output contract | `node --test tests/completion-verifier-surface-contract.test.mjs` | Pass | test output |
| SCN-04-2 | Completion authority remains unchanged | `node --test tests/verification-plane-contract.test.mjs tests/completion-authority-contract.test.mjs` | Pass | test output |

## Exact Execution Targets

| ID | Files To Create | Files To Modify | Files To Test | Commands | Expected Fail/Pass Signals |
|----|-----------------|-----------------|---------------|----------|----------------------------|
| P04-1 | `tests/completion-verifier-surface-contract.test.mjs` | none | new test | `node --test tests/completion-verifier-surface-contract.test.mjs` | RED then GREEN |
| P04-2 | `docs/public/guidelines/verification-workflow-evidence.md`, `.ko.md` | `docs/public/repository-layout.md`, skill docs | active tests | `node --test tests/active-contracts.test.mjs` | Classified guidelines, no placeholders |

## Blockers And Review

- Blocker condition: Output key names are removed or renamed.
- First review checkpoint: After new guideline and before skill rewrite.
- Re-review trigger: Any authority plane or `assess-completion` behavior change appears in the diff.
- Verification evidence path: surface contract tests plus authority tests.

## Validation Plan

- [ ] Surface contract: `node --test tests/completion-verifier-surface-contract.test.mjs`
- [ ] Active docs: `node --test tests/active-contracts.test.mjs`
- [ ] Authority regression: `node --test tests/verification-plane-contract.test.mjs tests/completion-authority-contract.test.mjs tests/workflow-e2e-contract.test.mjs`
- [ ] Package gate: `npm run test:package`
- [ ] Eval gate: `npm run test:eval`
- [ ] Full gate: `npm test`
- [ ] Hygiene: `git diff --check`

## Evidence to Mark Done

- Completion-verifier line count is reduced.
- New guideline pair exists and is classified in repository layout.
- Output shape keys are test-protected.
- Existing authority tests pass unchanged.

## Deliverables

- Compact completion-verifier skill docs.
- Workflow evidence guideline pair.
- Surface contract regression test.

## Phase Completion Checklist

- [ ] RED/GREEN surface contract added
- [ ] Guideline pair created and classified
- [ ] English/Korean verifier docs aligned
- [ ] Authority tests pass

## Handoff Notes

Phase 05 should not hide `completion-verifier` contract files from common payload; it should only remove them from public runtime discovery.
