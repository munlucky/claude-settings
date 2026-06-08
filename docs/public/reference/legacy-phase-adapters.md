# Legacy Phase Adapters

This reference is an archive catalog, not an active verification contract. The commands below are preserved for explicit delegated-terminal compatibility investigation only.

The archive root is `archive/scripts/legacy-phase-adapters/`. Do not move, delete, or install this root as part of active runtime profiles. Any use requires an explicit `legacyAdapterReason` in the run evidence and must also satisfy `checkPolicies.legacyValidationProfiles.legacy_phase_adapter` in `schemas/verification.contract.yaml`.

## Active Replacement

| Legacy area | Replacement/status |
|-------------|--------------------|
| Knowledge repository audit | Use active support scripts under `<MOONSHOT_RELAY_HOME>/scripts/` and current package/layout tests. |
| Code policy and workflow enforcement | Use active package, repository layout, sandbox, and verification-plane tests. |
| Phase runner parity and boundary checks | Use `scripts/prepare-phase-runner-state.mjs`, runtime-state helpers, and active phase-runner tests. |
| Phase closeout and checkpoint commit adapters | Use in-session coordinator closeout and `scripts/runtime-state.mjs assess-completion`; checkpoint commit adapters remain legacy only. |
| AWTL regression helpers | Preserved as historical compatibility evidence. They are not part of the active gate. |

## Catalog

| ID | Command | Status | Replacement |
|----|---------|--------|-------------|
| knowledgeAudit | `bash archive/scripts/legacy-phase-adapters/knowledge-repo-audit.sh` | archive-only | Active knowledge support-script health and package/layout tests |
| codePolicy | `node archive/scripts/legacy-phase-adapters/verify-code-policy.mjs` | archive-only | Active code policy, sandbox, and package tests |
| workflowEnforcement | `node archive/scripts/legacy-phase-adapters/workflow-enforcement.mjs verify` | archive-only | Active workflow contract tests |
| shellSyntax | `node archive/scripts/legacy-phase-adapters/verify-shell-syntax.mjs` | archive-only | Active script syntax and package tests |
| phaseRuntimeParity | `bash archive/scripts/legacy-phase-adapters/verify-phase-runtime-parity.sh .moonshot-relay/docs/runtime-parity-reference-plan` | archive-only | Active runtime-state and phase-runner readiness checks |
| phaseRunnerBoundary | `bash archive/scripts/legacy-phase-adapters/verify-phase-runner-boundary.sh` | archive-only | Active phase-runner boundary tests |
| phaseWorktreeParallel | `node archive/scripts/legacy-phase-adapters/phase-worktree-coordinator.mjs self-test` | archive-only | Active in-session coordinator and run lease checks |
| phaseCloseout | `node archive/scripts/legacy-phase-adapters/verify-phase-closeout.mjs --status-file ${PHASE_STATUS_FILE:-.moonshot-relay/docs/phase-status.yaml} --plan-dir ${PHASE_PLAN_DIR:-docs/implementation} --master-plan ${PHASE_MASTER_PLAN:-docs/implementation/00-master-plan-v1.md}` | archive-only | Active coordinator closeout and runtime-state completion authority |
| phaseFinalGitCloseout | `node archive/scripts/legacy-phase-adapters/phase-final-git-closeout.mjs preflight` | archive-only | Active final repository closeout evidence |
| phaseCheckpointCommit | `node archive/scripts/legacy-phase-adapters/phase-checkpoint-commit.mjs commit --plan-dir ${PHASE_PLAN_DIR:-docs/implementation} --status-file ${PHASE_STATUS_FILE:-.moonshot-relay/docs/phase-status.yaml} --phase-num ${PHASE_NUM:-1} --phase-title ${PHASE_TITLE:-phase}` | archive-only | Active commit-moonshot closeout flow |
| awtlRegression | `node --test archive/scripts/legacy-phase-adapters/lib/awtl-trace-sink.test.mjs archive/scripts/legacy-phase-adapters/lib/awtl-harness-capture.test.mjs archive/scripts/legacy-phase-adapters/lib/awtl-failure-attribution.test.mjs archive/scripts/legacy-phase-adapters/lib/awtl-memory-promotion.test.mjs archive/scripts/legacy-phase-adapters/lib/awtl-runtime-importers.test.mjs` | archive-only | Historical AWTL compatibility evidence |
| awtlFailurePreventionRegression | `node --test archive/scripts/legacy-phase-adapters/lib/awtl-failed-turn-case.test.mjs archive/scripts/legacy-phase-adapters/lib/awtl-failure-prevention-brief.test.mjs archive/scripts/legacy-phase-adapters/lib/awtl-replay-scorecard.test.mjs` | archive-only | Historical AWTL compatibility evidence |
| awtlCliSyntax | `node --check archive/scripts/legacy-phase-adapters/agent-loop-phase-runner.mjs && node --check archive/scripts/legacy-phase-adapters/agent-loop-phase-plan-lib.mjs && node --check archive/scripts/legacy-phase-adapters/awtl-failure-analyzer.mjs && node --check scripts/awtl-memory-promotion.mjs` | archive-only | Active syntax and package tests for maintained scripts |

## Use Policy

1. Record `legacyAdapterReason` before invoking any archived adapter.
2. Treat command output as compatibility evidence only.
3. Do not use archived adapter output to satisfy active completion authority.
4. Do not add archived adapter commands back to `schemas/verification.contract.yaml`.
