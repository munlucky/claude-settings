# Phase 05: Authoritative Verdict Identity Mode (v1)

## Source Mapping
| Req ID | AC ID | Source Section | Requirement Summary | This Phase Handling |
|--------|-------|----------------|---------------------|---------------------|
| REQ-1.9 | AC-09 | Plan v10 / Authoritative Identity Mode | Six-field identity hard fail applies only to authoritative verdicts. | Add shared required-key contract and single mode function. |

## Goal
- Prevent stale authoritative closeout verdicts without breaking legacy or temporary verdict writer paths.

## Expected Outcome
- `write-verification-verdict.py` hard-fails missing identity only when `isAuthoritativeVerdict(args)` is true.
- Non-authoritative verdicts can still be written with `identityStatus=legacy`.

## Phase Execution Metadata
```yaml
phaseExecution:
  schemaVersion: 1
  parallelEligible: true
  parallelGroup: "wave-2"
  dependsOn: ["01"]
  conflictsWith: ["03"]
  ownedPaths:
    - ".claude/schemas/required-verdict-identity-keys.json"
    - ".claude/scripts/write-verification-verdict.py"
    - ".claude/scripts/verification-verdict-state.mjs"
  readOnlyPaths:
    - ".claude/scripts/lib/current-artifacts-state.mjs"
    - ".claude/tests/fixtures/phase-closeout/phase-08-success/**"
  sharedMutablePaths: []
  requiresManualEvidence: false
  mergePolicy: "disjoint_patch"
```

## Scope
- Included:
  - `required-verdict-identity-keys.json`
  - Python `isAuthoritativeVerdict(args)`
  - Authoritative hard fail behavior.
  - Legacy `identityStatus=legacy`.
- Excluded:
  - Full JSON Schema validation.
  - Current pointer publish behavior.

## Detailed Tasks
| ID | Task | Steps | Done Criteria |
|----|------|-------|---------------|
| P05-1 | Add key contract | Create `.claude/schemas/required-verdict-identity-keys.json` with six keys. | JS/Python can read the same key list. |
| P05-2 | Add authoritative function | Implement `isAuthoritativeVerdict(args)` in `write-verification-verdict.py`. | All hard-fail branches use this one function. |
| P05-3 | Preserve legacy path | Non-authoritative verdicts missing identity write `identityStatus=legacy`. | Existing temporary verdict flows do not break. |
| P05-4 | Update reader classification | Authoritative current candidates require six identity keys; legacy verdicts are history only. | Identity-poor verdict cannot become current. |

## Exact Execution Targets
| ID | Create Files | Modify Files | Test Files | Command | Expected Fail/Pass Signal |
|----|--------------|--------------|------------|---------|---------------------------|
| P05-1 | `.claude/schemas/required-verdict-identity-keys.json` | none | verdict identity tests | `python .claude/scripts/write-verification-verdict.py --help` | CLI still loads. |
| P05-2 | none | `.claude/scripts/write-verification-verdict.py` | Python writer tests or fixture command | writer command with authoritative missing key | exits non-zero and writes no artifact. |
| P05-3 | none | `.claude/scripts/write-verification-verdict.py` | Python writer tests | non-authoritative missing key command | writes verdict with `identityStatus=legacy`. |

## Critical Product Scenarios
| Scenario | User-visible Expectation | Proof Command | Expected Pass Signal | Evidence Path |
|----------|--------------------------|---------------|----------------------|---------------|
| SCN-09 | Closeout verdict cannot be authoritative with partial identity. | authoritative writer test | artifact not created. | writer test output |
| SCN-10 | Legacy verdict generation still works for non-closeout paths. | non-authoritative writer test | `identityStatus=legacy`. | writer test output |

## Blockers And Review
- Blocker condition: `--authoritative` and `--verdict-scope phase_closeout` are interpreted in separate hard-fail branches.
- First review checkpoint: after `isAuthoritativeVerdict(args)` lands.
- Verification evidence path: writer tests and current reader tests.

## Validation Plan
- [ ] `python .claude/scripts/write-verification-verdict.py --help`
- [ ] authoritative missing identity writer test
- [ ] non-authoritative legacy writer test
- [ ] `pwsh -NoProfile -File .claude/scripts/run-node-tests-direct.ps1 .claude/scripts/*.test.mjs`

## Deliverables
- Required identity key contract.
- Updated verdict writer.
- Updated verdict reader classification.

## Phase Completion Checklist
- [ ] Authoritative hard fail only applies through one function.
- [ ] Legacy verdicts are not current candidates.
- [ ] Existing writer help/CLI still works.
