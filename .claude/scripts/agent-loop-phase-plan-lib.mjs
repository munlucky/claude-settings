#!/usr/bin/env node

import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

import { activeWorkspaceContract } from './lib/runtime-platform.mjs';
import { loadVerificationContractContext } from './lib/verification-contract.mjs';
import { resolveEffortEscalationReason, resolveEffortProfile } from './lib/effort-profile.mjs';
import { resolveModelRoute } from './lib/model-routing-policy.mjs';

export function sanitizeSlug(value) {
  return String(value || '')
    .replace(/\r/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '');
}

export function assignExecutionArtifactPaths(phaseNum, phaseTitle, executionRoot) {
  const phasePrefix = String(phaseNum).padStart(2, '0');
  let phaseSlug = sanitizeSlug(phaseTitle);
  if (!phaseSlug) {
    phaseSlug = `phase-${phasePrefix}`;
  }

  const phaseExecutionDir = `${executionRoot}/${phasePrefix}-${phaseSlug}`;
  return {
    phasePrefix,
    phaseSlug,
    phaseExecutionDir,
    phaseSprintContract: `${phaseExecutionDir}/SPRINT_CONTRACT.md`,
    phaseQaReport: `${phaseExecutionDir}/QA_REPORT.md`,
    phaseHandoff: `${phaseExecutionDir}/HANDOFF.md`,
    phaseScorecard: `${phaseExecutionDir}/SCORECARD.md`,
    phaseWorksets: `${phaseExecutionDir}/WORKSETS.yaml`,
  };
}

function extractMarkdownSection(text, heading) {
  const lines = String(text || '').split(/\r?\n/);
  let start = -1;
  let level = 0;
  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(/^(#{1,6})\s+(.+?)\s*$/);
    if (match && match[2].trim().toLowerCase() === heading.toLowerCase()) {
      start = index + 1;
      level = match[1].length;
      break;
    }
  }
  if (start < 0) {
    return '- Not found in source phase doc.';
  }
  let end = lines.length;
  for (let index = start; index < lines.length; index += 1) {
    const match = lines[index].match(/^(#{1,6})\s+/);
    if (match && match[1].length <= level) {
      end = index;
      break;
    }
  }
  return lines.slice(start, end).map((line) => line.trimEnd()).join('\n').trim()
    || '- Empty in source phase doc.';
}

function indentBlock(text) {
  return String(text || '').split(/\r?\n/).map((line) => `  ${line}`).join('\n');
}

function renderSourcePlanSnapshot(phaseDoc) {
  const sourceText = phaseDoc && fs.existsSync(phaseDoc) ? fs.readFileSync(phaseDoc, 'utf8') : '';
  if (!sourceText) {
    return `- Source phase doc: ${phaseDoc || 'missing'}
- Snapshot status: missing source phase document; completion must remain blocked until this is resolved.`;
  }

  return `- Source phase doc: ${phaseDoc}
- Goal:
${indentBlock(extractMarkdownSection(sourceText, 'Goal'))}
- Expected outcome:
${indentBlock(extractMarkdownSection(sourceText, 'Expected Outcome'))}
- Scope:
${indentBlock(extractMarkdownSection(sourceText, 'Scope'))}
- Detailed tasks:
${indentBlock(extractMarkdownSection(sourceText, 'Detailed Tasks'))}
- Exact execution targets:
${indentBlock(extractMarkdownSection(sourceText, 'Exact Execution Targets'))}
- Binding rule: these source requirements remain authoritative. Deleting, replacing, or deferring any item requires user-approved replan before this phase can close.`;
}

export function renderRequiredVerificationCommands(verificationContractFile, options = {}) {
  if (!verificationContractFile || !fs.existsSync(verificationContractFile)) {
    return '- Populate from the active verification contract before claiming completion.';
  }

  const context = loadVerificationContractContext(verificationContractFile, options);
  if (context.requiredChecks.length === 0) {
    return '- Populate from the active verification contract before claiming completion.';
  }

  return context.requiredChecks.map((check) => {
    return check.command
      ? `- ${check.name}: \`${check.command}\``
      : `- ${check.name}: declare the command in ${verificationContractFile}`;
  }).join('\n');
}

function renderScorecard({
  phasePrefix,
  phaseTitle,
  targetCompletionScore,
  phaseQaReport,
  phaseDoc,
  executionRoot,
  scorecardProfile,
}) {
  if (fs.existsSync('.claude/scripts/render-scorecard.py')) {
    const result = spawnSync('python3', [
      '.claude/scripts/render-scorecard.py',
      '--phase-prefix', phasePrefix,
      '--phase-title', phaseTitle,
      '--target-score', String(targetCompletionScore),
      '--qa-report', phaseQaReport,
      '--profile', scorecardProfile,
      '--phase-doc', phaseDoc,
      '--requirements-file', `${executionRoot}/REQUIREMENTS_TRACEABILITY.md`,
      '--scenario-file', `${executionRoot}/SCENARIO_MATRIX.md`,
    ], { encoding: 'utf8' });

    if (!result.error && (result.status ?? 0) === 0 && result.stdout) {
      return result.stdout;
    }
  }

  return `# Phase ${phasePrefix} Scorecard

> Objective completion score for phase ${phasePrefix}. Update after every meaningful implementation or verification round.
> Preset profile: generic (fallback)
> Profile selection: fallback:no-renderer
> Coverage rebalance: counts:absent

## Objective Checklist
| ID | Category | Weight | Status | Evidence | Notes |
|----|----------|--------|--------|----------|-------|
| OBJ-CONFORM | Source phase plan conformance verified | 20 | pending | ${phaseQaReport} | Source snapshot, exact targets, and approved deviations |
| OBJ-REQ | In-scope requirements covered | 25 | pending | ${phaseQaReport} | REQ-* coverage |
| OBJ-SCN | Critical scenarios evidenced | 25 | pending | ${phaseQaReport} | SCN-* runtime or E2E evidence |
| OBJ-VER | Required verification commands passed | 20 | pending | ${phaseQaReport} | Fresh contract-backed evidence |
| OBJ-CLOSE | Review and finish closeout recorded | 10 | pending | ${phaseQaReport} | Review + finish evidence present |

## Score Summary
- Current score: 0
- Target score: ${targetCompletionScore}
- Unmet checklist items: 5
- Blocking defects: 0
- Verdict: retry

## Loop Policy
- \`done\` requires Current score >= Target score
- \`done\` requires OBJ-CONFORM = pass
- \`done\` requires Unmet checklist items = 0
- \`done\` requires Blocking defects = 0
- \`blocked\` means environment, contract, or dependency prevents progress
- \`retry\` means continue the active phase only
`;
}

export function ensureExecutionArtifacts(config) {
  const {
    phaseNum,
    phaseTitle,
    phaseDoc,
    masterPlan,
    executionRoot,
    verificationContractFile,
    targetCompletionScore,
    scorecardProfile,
    workspaceRoot = process.cwd(),
    requestedRuntime = 'auto',
    verificationRuntimes = 'auto',
    currentRuntime = '',
  } = config;
  const paths = assignExecutionArtifactPaths(phaseNum, phaseTitle, executionRoot);
  const requiredCommands = renderRequiredVerificationCommands(verificationContractFile, {
    requestedRuntime,
    verificationRuntimes,
    currentRuntime,
  });
  const modelEffortProfile = resolveEffortProfile(
    process.env.PHASE_DISPATCH_EFFORT_PROFILE,
    process.env.MOONSHOT_EFFORT_PROFILE,
    'standard',
  );
  const effortEscalationReason = resolveEffortEscalationReason({
    profile: modelEffortProfile,
    explicitReason: process.env.PHASE_DISPATCH_EFFORT_ESCALATION_REASON
      ?? process.env.MOONSHOT_EFFORT_ESCALATION_REASON,
  });
  const retrievalBudget = 'stage=1 compact recall; repeat only for missing owner/date/path/API/failure fact; stopWhenAnswerable=true; no raw graph or memory output';
  const validationProfile = 'workflow_core';
  const phaseReplayPolicy = 'preserve assistant phase commentary/final_answer when replaying; never add phase to user items';
  const modelRoute = resolveModelRoute({
    runtime: currentRuntime || requestedRuntime || 'auto',
    stage: process.env.PHASE_MODEL_STAGE || 'phase_implementation',
    profile: modelEffortProfile,
  });

  fs.mkdirSync(paths.phaseExecutionDir, { recursive: true });

  if (!fs.existsSync(paths.phaseSprintContract)) {
    const sprint = `# Phase ${paths.phasePrefix} Sprint Contract

> Seeded automatically by \`agent-loop.mjs\`. Refresh before code changes.

## Slice
- Phase: ${phaseNum}
- Title: ${phaseTitle}
- Source plan: ${masterPlan}
- Source phase doc: ${phaseDoc}

## Goal
- Fill before code changes with the user-visible outcome for this round.

## Success Criteria
- In-scope source-plan requirements are implemented or explicitly blocked.
- Review, verification, scorecard, and handoff evidence agree before clean finish.

## Constraints
- Preserve phase return boundaries, review-before-finish, verification evidence, security, and no raw MemoryGraph/CodeReviewGraph output.

## Output
- Update code/docs only inside the active phase scope and record durable evidence in the active execution artifacts.

## Stop Rules
- Continue while actionable phases remain.
- Stop only on clean plan-directory completion or a recorded blocker/user pause.

## Source Plan Requirements Snapshot
${renderSourcePlanSnapshot(phaseDoc)}

## Spec Deviation Ledger
| Plan Item | Planned Requirement | Actual / Proposed Change | Approval | Completion Impact | Required Action |
|-----------|---------------------|--------------------------|----------|-------------------|-----------------|
| none | none | none | none | none | none |

## Non-Goals
- Fill before code changes.

## Stage Order
- Ready / Isolate
- Execute
- Review
- Verify
- Finish / Handoff

## Harness Selection
- Selected harness components: phase-runner, contract, implementation, review, verification, finish
- Skipped harness components: none
- Selection reason: phase work uses the full cross-runtime harness by default.
- Runtime isolation: runtime-adapter; runtime-specific tool flags stay outside the user-facing contract.
- Model effort profile: ${modelEffortProfile}
- Effort escalation reason: ${effortEscalationReason}
- Selected model provider: ${modelRoute.provider}
- Selected model: ${modelRoute.model || 'runtime-default'}
- Selected model effort: ${modelRoute.effort || 'runtime-default'}
- Model selection reason: ${modelRoute.selectionReason}
- Retrieval budget: ${retrievalBudget}
- Validation profile: ${validationProfile}
- Phase replay policy: ${phaseReplayPolicy}

## Planned Changes
- Files/modules:
- Interfaces/contracts:

## Contract Review
- Contract reviewed by evaluator: no
- Verification owner: completion-verifier
- Runtime evidence plan: Define before implementation. Critical SCN-* scenarios require open -> act -> mutate -> persist -> recover evidence.
- Round fail conditions: Missing contract review, missing runtime evidence plan, smoke-only critical scenario evidence, repeated failure class without retry strategy, or stale verification.
- Contract revision required: no
- Review notes:

## Policy Anchors
- Always-loaded rules: AGENTS.md, .claude/CLAUDE.md, .claude/rules/**
- Active workspace contract: ${activeWorkspaceContract(workspaceRoot)}
- Verification contract: ${verificationContractFile}
- Phase-specific guides: .claude/docs/guidelines/long-running-harness.md
- Round policy summary: Keep this run isolated to phase ${paths.phasePrefix}, refresh QA/HANDOFF artifacts when state changes, and require fresh verification evidence before completion.
- Work runtime: ${currentRuntime || requestedRuntime || 'auto'}
- Verification runtime target: ${verificationRuntimes || 'auto'}

## Review Cadence
- First review checkpoint: After the first meaningful implementation batch for this phase.
- Re-review trigger: Any remediation round that changes behavior, contracts, or user-visible flows.
- Review owners: codex-review-code, plus targeted reviewers when needed.

## Done Checks
| Check | Type | Pass Condition |
|-------|------|----------------|
|  | UI/API/Test |  |

## Evaluator Focus
- Core flow:
- Edge cases:
- Stub-only behavior to reject:

## Evidence
### Required Verification Commands
${requiredCommands}

### Runtime Flow
- Runtime evidence depth: pending
- Critical SCN-* minimum: open -> act -> mutate -> persist -> recover
- Fill before runtime verification.

### Artifacts
- QA report: ${paths.phaseQaReport}
- Handoff: ${paths.phaseHandoff}
- Scorecard: ${paths.phaseScorecard}
- Worksets: ${paths.phaseWorksets}

## Finish Rule
- Clean finish requires: fresh verification evidence, review complete, and finish-stage closeout recorded.
- Source plan conformance: required; run \`.claude/scripts/verify-plan-conformance.mjs\` before clean finish. Unapproved plan deviations force \`retry_loop\`.
- Continue-now rule: if in-scope work remains and there is no blocker, interruption, user pause, or intentionally deferred verification, continue execution; checkpoint evidence alone is not a stop reason.
- Resume-later handoff trigger: blocked criteria, interruption, or intentionally deferred verification.
- Retry-loop trigger: verification or review returns actionable failures for this phase.
- Score target: ${targetCompletionScore}

## Risks
- Known uncertainty:
- Rollback or safe fallback:

## Notes
- Generated at: ${new Date().toISOString().replace('T', ' ').slice(0, 19)}
`;
    fs.writeFileSync(paths.phaseSprintContract, `${sprint}\n`, 'utf8');
  }

  if (!fs.existsSync(paths.phaseQaReport)) {
    const qa = `# Phase ${paths.phasePrefix} QA Report

> Updated by verifier/runtime steps. Seeded automatically by \`agent-loop.mjs\`.

## Slice
- Phase: ${phaseNum}
- Title: ${phaseTitle}
- Contract: ${paths.phaseSprintContract}

## Verdict
- Status: pending
- Summary: Awaiting implementation and verification.
- Scope status: partial
- Next path: retry_loop
- Closeout reason: verification_failed

## Review Checkpoint
- Review completed: no
- Review owners: codex-review-code
- Review-driven code changes:

## Contract Review Evidence
- Contract reviewed by evaluator: no
- Verification owner: completion-verifier
- Runtime evidence plan: pending
- Round fail conditions: missing contract review or runtime evidence plan keeps this phase in retry_loop
- Contract revision required: no

## Failure Loop
- Retry strategy: same_direction_refine
- Delta hypothesis: first attempt pending
- Repeated failure policy: if the same failure class repeats twice, choose partial_redesign or stop_and_handoff before another attempt

## Criteria Review
| Criterion | Result | Notes |
|-----------|--------|-------|
|  | pending |  |

## Plan Conformance Review
| Plan Item | Required | Actual | Result | Required Action |
|-----------|----------|--------|--------|-----------------|
| Source plan snapshot preserved | Source phase doc requirements remain authoritative in SPRINT_CONTRACT.md | pending | pending | Compare source phase doc before closeout |
| Exact execution targets satisfied | Required files, dependencies, and expected signals are implemented or user-approved replan exists | pending | pending | Run \`.claude/scripts/verify-plan-conformance.mjs\` |
| Spec deviation ledger clean | No unapproved delete/substitute/defer decisions | pending | pending | Record retry_loop or user-approved-replan |

## Findings
| Severity | Area | Reproduction | Expected | Actual |
|----------|------|--------------|----------|--------|
|  |  |  |  |  |

## Runtime Updates
- Seeded at: ${new Date().toISOString().replace('T', ' ').slice(0, 19)}
- Verification verdict file: .claude/verification-verdict-phase${paths.phasePrefix}-final.json
- Verification verdict: pending
- Runtime evidence depth: pending
- Critical scenario smoke-only warnings: none

## Workflow Execution
- Selected bundles: ready-isolate-bundle, implementation-bundle, review-bundle, verification-bundle, finish-bundle
- Applied skills: implementation-runner, completion-verifier
- Skipped skills: codex-review-code (review pending until the first meaningful implementation batch completes), code-simplifier (not evaluated yet), session-logger (clean completion path unless the phase stops without clean completion)
- Selected harness components: phase-runner, contract, implementation, review, verification, finish
- Skipped harness components: none
- Selection reason: phase work uses the full cross-runtime harness by default
- Runtime isolation: runtime-adapter; runtime-specific tool flags stay outside the user-facing contract
- Model effort profile: ${modelEffortProfile}
- Effort escalation reason: ${effortEscalationReason}
- Selected model provider: ${modelRoute.provider}
- Selected model: ${modelRoute.model || 'runtime-default'}
- Selected model effort: ${modelRoute.effort || 'runtime-default'}
- Model selection reason: ${modelRoute.selectionReason}
- Retrieval budget: ${retrievalBudget}
- Validation profile: ${validationProfile}
- Phase replay policy: ${phaseReplayPolicy}
- Enforcement note: replace defaults when actual execution diverges

## Score Summary
- Current score: 0
- Target score: ${targetCompletionScore}
- Unmet checklist items: 1
- Blocking defects: 0
- Verdict: retry

## Finish Readiness
- Fresh evidence confirmed: no
- Source plan conformance confirmed: no
- Why this round may stop now:
- Remaining in-scope work:
- Remaining blockers before closeout:
- Checks to rerun if code changes again:
`;
    fs.writeFileSync(paths.phaseQaReport, `${qa}\n`, 'utf8');
  }

  if (!fs.existsSync(paths.phaseHandoff)) {
    const handoff = `# Phase ${paths.phasePrefix} Handoff

> Seeded automatically by \`agent-loop.mjs\`. Replace this placeholder when the phase stops or closes cleanly.

## Goal
- ${phaseTitle}
- Current stage: Finish / Handoff

## Status
- Required: pending
- Reason: placeholder handoff seeded before the first stop or clean-finish update

## Resume Trigger
- Why this handoff exists: the phase has not produced a stop-state handoff yet
- Stop reason: blocked
- Why this cannot continue in the current round: no stop-state detail has been recorded yet
- Condition to resume: continue the active phase and overwrite this placeholder with the latest runtime state when needed

## Checks To Rerun
- Review: update when the phase stops without clean completion
- Verification: update when the phase stops without clean completion
- Runtime flow: update when the phase stops without clean completion

## Remaining Scope
- Remaining in-scope work: active phase execution has not completed yet
- Next planned phase or slice: stay on the current phase until closeout is recorded

## Evidence Paths
- Sprint contract: ${paths.phaseSprintContract}
- QA report: ${paths.phaseQaReport}
- Phase doc: ${phaseDoc}
- Scorecard: ${paths.phaseScorecard}

## Workflow Logging
- session-logger: not recorded yet
- Detail: placeholder only
- Selected model provider: ${modelRoute.provider}
- Selected model: ${modelRoute.model || 'runtime-default'}
- Selected model effort: ${modelRoute.effort || 'runtime-default'}
- Model selection reason: ${modelRoute.selectionReason}
`;
    fs.writeFileSync(paths.phaseHandoff, `${handoff}\n`, 'utf8');
  }

  if (!fs.existsSync(paths.phaseScorecard)) {
    fs.writeFileSync(paths.phaseScorecard, renderScorecard({
      phasePrefix: paths.phasePrefix,
      phaseTitle,
      targetCompletionScore,
      phaseQaReport: paths.phaseQaReport,
      phaseDoc,
      executionRoot,
      scorecardProfile,
    }), 'utf8');
  }

  if (!fs.existsSync(paths.phaseWorksets)) {
    const worksets = `# Phase ${paths.phasePrefix} worksets for opt-in worktree parallel execution.
# Default is disabled: leave worksets empty until the phase owner defines non-overlapping ownedPaths.
worksets: []
`;
    fs.writeFileSync(paths.phaseWorksets, worksets, 'utf8');
  }

  return paths;
}

export function buildPhasePrompt(config) {
  const {
    nextPhase,
    phaseTitle,
    planDir,
    phaseDoc,
    statusFile,
    executionRoot,
    paths,
    runtime,
    targetCompletionScore,
    extraInstructions = '',
    autonomousInstructions = '',
    workspaceRoot = process.cwd(),
    verificationRuntimes = 'auto',
  } = config;

  let promptHeader = '/moonshot-orchestrator';
  let codexDirectSteps = '';

  if (runtime === 'codex') {
    promptHeader = `Moonshot orchestrator phase-attempt fallback for Codex
Treat this prompt as the direct equivalent of a /moonshot-orchestrator phase attempt.`;
    codexDirectSteps = `
Codex direct execution checklist:
1. Read only the active phase doc and SPRINT_CONTRACT.md first.
2. Immediately write an attempt-started checkpoint to QA_REPORT.md and SCORECARD.md before broader inspection or long-running commands.
3. Refresh SPRINT_CONTRACT.md for this attempt without broad repo inspection.
4. Execute only the active phase work.
5. Run review and verification in the phase contract order.
6. Use \`.claude/scripts/write-verification-verdict.py\` for structured \`.claude/verification-verdict-*.json\` output in the repository root instead of hand-authoring verdict JSON.
   Include model routing args when available: \`--selected-model-provider\`, \`--selected-model\`, \`--selected-model-effort\`, \`--model-selection-reason\`.
   기본 인자만 넣어도 동작합니다.
   예: \`python3 .claude/scripts/write-verification-verdict.py --output .claude/verification-verdict-phase02-final.json --run-id phase02-final --phase-number 2\`
7. Record the exact repository-root verdict path in QA_REPORT.md as \`- Verification verdict file: .claude/verification-verdict-...\`.
8. Update QA_REPORT.md with runtime/mode, review state, and verification evidence.
9. Update SCORECARD.md with objective checklist status, score, unmet items, and verdict.
10. Stop only when source plan conformance passes, verification passed or is still fresh, review evidence is recorded, finish-stage closeout is concrete, SCORECARD.md says \`Verdict: done\`, and SCORECARD.md says \`Current task status: FULL\`. If any of those are missing, keep the phase open and record the next remediation action instead of treating the checkpoint as a stop boundary.
11. Even when this phase reaches clean completion, do not phrase the result as plan completion or session completion. Return control to the outer loop only.

Do not spend time on extra planning, repo discovery, or alternative verifier selection before step 5.
Edit the artifact files directly with the runtime's file-edit tool. Do not use shell heredocs or inline apply_patch commands for these artifact updates.`;
  }

  return `${promptHeader}
phaseAttemptMode: true
phaseNumber: "${nextPhase}"
phaseTitle: "${phaseTitle}"
planDir: "${planDir}"
activePhaseDocPath: "${phaseDoc}"
phaseStatusFile: "${statusFile}"
executionRoot: "${executionRoot}"
executionArtifacts:
  sprintContractPath: "${paths.phaseSprintContract}"
  qaReportPath: "${paths.phaseQaReport}"
  handoffPath: "${paths.phaseHandoff}"
  scorecardPath: "${paths.phaseScorecard}"
  worksetsPath: "${paths.phaseWorksets}"
  verificationVerdictGlob: ".claude/verification-verdict-*.json"

Single isolated phase-attempt rules:
- Treat this run as one isolated phase attempt only.
- This attempt may finish the active phase, but phase completion is never run completion or session completion.
- Set signals.phaseAttemptMode = true.
- Set artifacts.activePhaseDocPath = "${phaseDoc}".
- Reuse the provided execution artifact paths.
- Do not invoke moonshot-phase-runner again.
- Do not expand to other phases.
- Read the Policy Anchors section in SPRINT_CONTRACT.md first.
- Treat the Source Plan Requirements Snapshot as binding; do not replace, narrow, or defer source phase requirements without a user-approved replan recorded in Spec Deviation Ledger.
- Preserve the stage order \`ready/isolate -> execute -> review -> verify -> finish/handoff\`.
- Immediately after reading the active phase doc and SPRINT_CONTRACT.md, write an in-progress checkpoint to QA_REPORT.md and SCORECARD.md before broader inspection or long-running commands.
- Before code edits, refresh SPRINT_CONTRACT.md for this phase.
- Record review completion before claiming the verifier state is final.
- Generate fresh structured verification verdicts with \`.claude/scripts/write-verification-verdict.py\` and write them under \`.claude/verification-verdict-*.json\`; do not hand-author verdict JSON.
  Include model routing args when available: \`--selected-model-provider\`, \`--selected-model\`, \`--selected-model-effort\`, \`--model-selection-reason\`.
  기본 인자만 넣어도 동작하도록 스키마를 완화했습니다.
- If a required verifier is blocked by runtime/tool availability, write a blocked verification verdict instead of keeping the phase in blind retry.
- Respect the active verification runtime target: ${verificationRuntimes}.
- Record the exact repository-root verdict path in QA_REPORT.md so the completion gate can confirm the same file.
- Refresh QA_REPORT.md at stage transitions instead of batching every artifact update at the end.
- When verification runs, update QA_REPORT.md.
- Update SCORECARD.md on every meaningful round using objective checklist status, current score, unmet items, and verdict.
- Refresh SCORECARD.md again after verification or any remediation so progress is visible while the phase is still running.
- Refresh the default values in the "Workflow Execution", "Contract Review Evidence", and "Failure Loop" sections of QA_REPORT.md when actual execution diverges.
- Keep Effort escalation reason, selected model provider/model/effort/reason, Retrieval budget, Validation profile, and Phase replay policy current in QA_REPORT.md and analysis workflow evidence.
- If Model effort profile is \`deep\` or \`max\`, record a concrete Effort escalation reason; \`none\` is allowed only for \`economy\` or \`standard\`.
- Preserve assistant-item \`phase\` values when replaying assistant history: \`commentary\` for progress updates and \`final_answer\` only for completed answers. Never add phase metadata to user messages.
- For critical SCN-* scenarios, smoke-only evidence is a warning and cannot justify clean finish; record open -> act -> mutate -> persist -> recover evidence or keep the phase open.
- If the same failure class repeats twice, set Retry strategy to partial_redesign or stop_and_handoff before the next attempt.
- Before any clean-finish claim, run \`.claude/scripts/verify-plan-conformance.mjs\` against the active phase artifacts and record the result in QA_REPORT.md Plan Conformance Review and SCORECARD.md OBJ-CONFORM.
- If implementation differs from the source phase plan, use \`retry_loop\` unless the user explicitly approved a replan and the phase doc or Spec Deviation Ledger records that approval.
- In QA_REPORT.md, use only these closeout reason codes: \`scope_complete\`, \`verification_failed\`, \`blocked\`, \`interrupted\`, \`context_limit\`, \`user_pause\`, \`deferred_verification\`.
- If QA_REPORT.md uses \`Next path: retry_loop\`, it must also use \`Closeout reason: verification_failed\`.
- In HANDOFF.md, use only these stop reason codes: \`blocked\`, \`interrupted\`, \`context_limit\`, \`user_pause\`, \`deferred_verification\`.
- Never use \`verification_failed\` as a HANDOFF.md stop reason; keep \`verification_failed\` only in QA_REPORT.md Closeout reason and use \`blocked\` or \`deferred_verification\` for the handoff stop reason.
- If meaningful code changed, record \`code-simplifier\` in Applied skills or Skipped skills with a reason.
- If the run stops without clean completion, update HANDOFF.md, include \`session-logger\` evidence, and list the checks to rerun.
- Do not mark the phase done while SCORECARD.md says \`Verdict: retry\` or \`blocked\`.
- Do not mark the phase done while source plan conformance is failing, OBJ-CONFORM is not \`pass\`, or unapproved deviation/deferred scope remains.
- Do not mark the phase done while Current score is below ${targetCompletionScore}, Unmet checklist items > 0, or Blocking defects > 0.
- Do not emit final-answer wording, closeout phrasing, or "all done" style language from this attempt. Return only updated artifacts, verification state, and an attempt-scoped summary.
- If this attempt reaches clean phase completion, return control to the outer loop with the phase marked complete and let the outer loop decide whether another actionable phase remains.

Runtime compatibility fallback:
- If /moonshot-orchestrator is unavailable in this runtime, execute the equivalent phase-attempt workflow directly instead of searching for missing slash skills.
- In fallback mode, use only the active phase doc, SPRINT_CONTRACT.md, QA_REPORT.md, HANDOFF.md, SCORECARD.md, ${activeWorkspaceContract(workspaceRoot)}, .claude/verification.contract.yaml, and .claude/docs/guidelines/long-running-harness.md unless the phase doc explicitly requires more.
- Do not inspect unrelated repository files once the required verification command and artifact updates are clear.
- Do not stop at implementation-complete or verification-complete checkpoints alone.
- Return control only after fresh-or-still-valid verification evidence exists, review evidence is recorded, finish-closeout fields are concrete, SCORECARD.md says \`Verdict: done\`, and SCORECARD.md says \`Current task status: FULL\`.
- Return control only after source plan conformance passes, fresh-or-still-valid verification evidence exists, review evidence is recorded, finish-closeout fields are concrete, SCORECARD.md says \`Verdict: done\`, and SCORECARD.md says \`Current task status: FULL\`. If any completion gate is still open, keep the active phase in retry with explicit remediation evidence instead of handing off early.${codexDirectSteps}
- Treat "phase complete" as an attempt-local result only. Never use it as proof that the whole plan or user session may end; that decision belongs to the outer loop after re-reading ${statusFile}.

Additional instructions:
${extraInstructions}

${autonomousInstructions}`.trimEnd();
}
