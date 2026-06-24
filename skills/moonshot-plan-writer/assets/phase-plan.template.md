# Phase <NN>: <Title> (v<version>)

## Source Mapping
| Req ID | Source Section | Requirement Summary | This Phase Handling |
|--------|----------------|---------------------|---------------------|
| SRC-<n> | <source-name> <section> | <summary> | <task linkage> |

## Goal
- <phase goal>

## Expected Outcome
- <measurable outcome>

## Phase Execution Metadata
```yaml
phaseExecution:
  schemaVersion: 1
  parallelEligible: true
  parallelGroup: "<wave-slug>"
  dependsOn: []
  conflictsWith: []
  ownedPaths:
    - <paths this phase may create or modify>
  readOnlyPaths:
    - <paths this phase may inspect only>
  sharedMutablePaths: []
  surfaceClassifications:
    - surfaceId: "<stable-surface-id>"
      category: "source_only | package_runtime_payload | installed_profile_or_account_root | external_deployment_or_service | data_or_state_migration"
      policySourcePaths:
        - "<project policy source or missing-policy>"
      requiredEvidenceSlots:
        - "<slot names from master adoptionSurface>"
      concreteGateCommandsSource: "project_policy | phase_plan | not_applicable | missing_policy"
  requiresManualEvidence: false
  mergePolicy: "disjoint_patch"

mvpMethodology:
  profile: "none | demo_first"
  sliceId: "<stable-slice-id>"
  maturityTarget: "demo_ready_ui | mock_functional_demo | demo_evidence_capture | user_demo_approval | real_functional | real_functional_verification | production_hardening"
  demoGate:
    required: true
    mode: hard_stop
    approvalSource: "{planRoot}/demo/USER_DEMO_APPROVAL.md"
    evidenceSource: "{planRoot}/demo/DEMO_EVIDENCE.md"
    mockContractSource: "{planRoot}/demo/MOCK_API_CONTRACT.md"
    blocks:
      - real_functional
      - production_backend
      - real_persistence
      - auth_integration
      - irreversible_migration
```

- Set `parallelEligible: false` and add blocker notes when `ownedPaths` are ambiguous, shared mutable files are required, or manual evidence is required.
- Set `concreteGateCommandsSource: missing_policy` and block execution readiness when a non-source-only surface lacks project policy for its required evidence slots.
- Use `mvpMethodology.profile: demo_first` only for MVP slices that require user demo approval before Real Functional work.

## Scope
- In scope:
  - <item>
- Out of scope:
  - <item>

## Preconditions and Inputs
- Required docs:
  - `{planRoot}/00-master-plan-v<version>.md`
- Demo-first MVP docs, when profile is `demo_first`:
  - `{planRoot}/demo/MOCK_API_CONTRACT.md`
  - `{planRoot}/demo/DEMO_EVIDENCE.md`
  - `{planRoot}/demo/USER_DEMO_APPROVAL.md`
- Required code/data:
  - <item>

## Detailed Tasks
| ID | Task | Steps | Done Criteria |
|----|------|-------|---------------|
| P<NN>-1 | <task> | 1) <step> 2) <step> | <objective condition> |

## Critical Product Scenarios
| ID | User-Visible Expectation | Verification Command | Expected Signal | Evidence Path |
|----|--------------------------|----------------------|-----------------|---------------|
| SCN-<NN>-1 | <observable behavior, rendered output, generated asset, or workflow result> | `<command>` | <pass signal that proves behavior, not only file existence> | `<path>` |

## Exact Execution Targets
| ID | Files To Create | Files To Modify | Files To Test | Commands | Expected Fail/Pass Signals |
|----|-----------------|-----------------|---------------|----------|----------------------------|
| P<NN>-1 | <paths or none> | <paths> | <paths> | `<command>` | <expected output / exit code> |

## Blockers And Review
- Blocker condition:
- First review checkpoint:
- Re-review trigger:
- Verification evidence path:

## Validation Plan
- [ ] Build/type checks: <command>
- [ ] Behavior checks: <what to verify>
- [ ] Regression checks: <what to verify>
- [ ] Surface/adoption checks: <project-policy sourced evidence slots, or not applicable for source_only>

## Evidence to Mark Done
- <test log path>
- <changed file list>
- <verification notes>
- <surface classification and policy-sourced adoption evidence, when applicable>
- Demo-first evidence, when profile is `demo_first`:
  - Mock Functional Demo: mock success path and mock error path evidence.
  - Demo Evidence Capture: demo run command and tested route/flow evidence.
  - User Demo Approval: approved non-empty scope in `USER_DEMO_APPROVAL.md`.
  - Real Functional: real API/persistence evidence plus contract parity against `MOCK_API_CONTRACT.md`.

## Deliverables
- <file/path or artifact>

## Phase Completion Checklist
- [ ] All detailed tasks meet done criteria
- [ ] Validation checks pass
- [ ] Deliverables are present and reviewed
- [ ] Demo-first gate is satisfied for the current maturity target, when applicable

## Handoff Notes
- <notes for the next session/phase>
