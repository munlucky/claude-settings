# Phase 08: Runtime Capability Status And Resume Model (v1)

## Source Mapping

| Req ID | Source Section | Requirement Summary | This Phase Handling |
|---|---|---|---|
| OHA-010 | User strategy Phase 7 | Add runtime capability matrix, deferred tool lookup, MCP unavailable classification, fallback policy | Update runtime adapter and preflight docs |
| OHA-011 | User strategy Phase 8 | Add compact status, event-backed progress, stale progress detection, resume brief, lineage ids | Update status/resume read model |
| OHA-014 | Additional improvements | Add runtime doctor and QA backend matrix linkage | Add diagnostics and capability reporting |

## Goal

- Make runtime capabilities, MCP/tool availability, fallback mode, status freshness, and resume context visible and machine-checkable.

## Expected Outcome

- Codex/Claude runtime differences are recorded before execution or as degraded evidence.
- MCP unavailable is classified as tool/runtime unavailability, not generic harness failure.
- Status output and resume briefs show active contract, latest verdict, current blocker, lineage ids, and stale pointer warnings.
- `moon-ai-workflow` or other TUI surfaces can consume stable read-model fields later.

## Phase Execution Metadata

```yaml
phaseExecution:
  schemaVersion: 1
  parallelEligible: false
  parallelGroup: "closeout"
  dependsOn:
    - "05"
    - "06"
    - "07"
  conflictsWith: []
  ownedPaths:
    - ".claude/skills/moonshot-orchestrator/SKILL.md"
    - ".claude/skills/moonshot-phase-runner/SKILL.md"
    - ".claude/scripts/workflow-enforcement.mjs"
    - ".claude/scripts/verify-phase-runtime-parity.sh"
    - ".claude/scripts/verify-phase-runtime-parity-shell-core.sh"
    - ".claude/verification.contract.yaml"
    - ".claude/docs/guidelines/"
    - "docs/implementation/ouroboros-harness-adoption-2026-05-10/08-runtime-capability-status-resume-model-v1.md"
  readOnlyPaths:
    - ".claude/logs/workflow-enforcement/"
    - ".claude/docs/phase-status.yaml"
    - "docs/analysis/ouroboros-harness-adoption-inventory.md"
  sharedMutablePaths:
    - ".claude/verification.contract.yaml"
  requiresManualEvidence: false
  mergePolicy: "sequential_closeout_sync"
```

## Scope

- In scope:
  - Add runtime capability matrix fields for fork, MCP, shell, browser, worktree, tool inheritance, and fallback support.
  - Add deferred tool lookup rule to relevant runtime/skill docs.
  - Add MCP unavailable classification and local fallback policy.
  - Add compact status and resume brief schema.
  - Add stale progress and stale dispatch/current-run pointer checks.
  - Add runtime doctor/checklist guidance.
- Out of scope:
  - Building a new TUI.
  - Adding new public CLI commands.
  - Requiring MCP-only execution.

## Preconditions and Inputs

- Phase 05 event ledger provides lineage ids.
- Phase 06 evaluation trigger fields exist.
- Phase 07 stop reason taxonomy exists.

## Detailed Tasks

| ID | Task | Steps | Done Criteria |
|---|---|---|---|
| P08-1 | Add capability matrix | Define runtime capability fields and degradation semantics | Workflow evidence records capability status |
| P08-2 | Add deferred tool lookup policy | Update runtime adapter/skill docs to search before unavailable | Tool unavailable reports include lookup evidence |
| P08-3 | Add MCP unavailable classification | Classify missing MCP separately from harness/product failure | Verdict and status show `mcp_unavailable` or equivalent |
| P08-4 | Add compact status/read model | Expose active contract, latest verdict, current blocker, lineage ids | Status fixture is freshness-checked |
| P08-5 | Add resume brief | Generate or document resume brief shape from event/status/verdict | Handoff contains next action and evidence refs |
| P08-6 | Add runtime doctor | Add diagnostic checklist or script target for runtime/tool/path config | Doctor output is actionable |

## Critical Product Scenarios

| ID | User-Visible Expectation | Verification Command | Expected Signal | Evidence Path |
|---|---|---|---|---|
| SCN-P08-1 | Missing MCP does not look like product implementation failure | runtime capability fixture | unavailable tool classified separately | `QA_REPORT.md` for this phase |
| SCN-P08-2 | Status detects stale progress or stale dispatch pointers | workflow-enforcement fixture | stale pointer warning or violation appears | `QA_REPORT.md` for this phase |
| SCN-P08-3 | Resume brief points to latest contract/verdict/blocker | status/resume fixture | resume brief has matching lineage ids | `QA_REPORT.md` for this phase |

## Exact Execution Targets

| ID | Files To Create | Files To Modify | Files To Test | Commands | Expected Fail/Pass Signals |
|---|---|---|---|---|---|
| P08-1 | optional guideline | `.claude/skills/moonshot-orchestrator/SKILL.md`, `.claude/skills/moonshot-phase-runner/SKILL.md` | knowledge audit | `bash .claude/scripts/knowledge-repo-audit.sh` | Errors 0 |
| P08-2 | optional fixture | `.claude/scripts/workflow-enforcement.mjs` | workflow verify | `bash .claude/scripts/workflow-enforcement.sh verify` | Exit 0 |
| P08-3 | optional diagnostic doc/script | `.claude/verification.contract.yaml`, runtime parity scripts | runtime parity checks | `bash .claude/scripts/verify-phase-runner-boundary.sh` | Exit 0 |

## Blockers And Review

- Blocker condition: Runtime capability status becomes stale or contradicts actual runtime behavior.
- First review checkpoint: Review capability fields against Codex and Claude Code before making them strict.
- Re-review trigger: Any new runtime target beyond Codex/Claude.
- Verification evidence path: `docs/implementation/ouroboros-harness-adoption-2026-05-10/execution/08-phase-08-runtime-capability-status-resume-model-v1/QA_REPORT.md`

## Validation Plan

- [ ] `bash .claude/scripts/knowledge-repo-audit.sh`
- [ ] `bash .claude/scripts/workflow-enforcement.sh verify`
- [ ] `bash .claude/scripts/verify-phase-runner-boundary.sh`
- [ ] `PHASE_RUNTIME_PARITY_KEEP_TMP=true bash .claude/scripts/verify-phase-runtime-parity.sh .claude/docs/runtime-parity-reference-plan`

## Evidence to Mark Done

- Capability matrix fixture or docs.
- Status/resume read-model evidence.
- Runtime parity/boundary verification output.

## Deliverables

- Runtime capability matrix and degradation policy.
- Deferred tool lookup and MCP unavailable classification.
- Compact status/resume model.
- Runtime doctor/checklist.

## Phase Completion Checklist

- [ ] Runtime capability fields are defined and recorded.
- [ ] MCP/tool unavailable is not conflated with product failure.
- [ ] Status/resume model is freshness-checked.
- [ ] Runtime parity and boundary checks pass or record exact environment blockers.

## Handoff Notes

- After Phase 08, run documentation sync and package-level closeout. If downstream sync is requested, use `moonshot-harness-maintainer` conservative sync policy and preserve target-local memory/log/state.
