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
  requiresManualEvidence: false
  mergePolicy: "disjoint_patch"
```

- Set `parallelEligible: false` and add blocker notes when `ownedPaths` are ambiguous, shared mutable files are required, or manual evidence is required.

## Scope
- In scope:
  - <item>
- Out of scope:
  - <item>

## Preconditions and Inputs
- Required docs:
  - `docs/implementation/00-master-plan-v<version>.md`
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

## Evidence to Mark Done
- <test log path>
- <changed file list>
- <verification notes>

## Deliverables
- <file/path or artifact>

## Phase Completion Checklist
- [ ] All detailed tasks meet done criteria
- [ ] Validation checks pass
- [ ] Deliverables are present and reviewed

## Handoff Notes
- <notes for the next session/phase>
