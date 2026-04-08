#!/usr/bin/env node

import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

import { activeWorkspaceContract } from './lib/runtime-platform.mjs';

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
  };
}

export function renderRequiredVerificationCommands(verificationContractFile) {
  if (!verificationContractFile || !fs.existsSync(verificationContractFile)) {
    return '- Populate from the active verification contract before claiming completion.';
  }

  const lines = fs.readFileSync(verificationContractFile, 'utf8').split(/\r?\n/);
  const commands = {};
  const requiredChecks = [];
  let section = '';

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }
    if (/^[A-Za-z0-9_-]+:$/.test(line)) {
      section = line.slice(0, -1);
      continue;
    }
    if (section === 'commands') {
      const match = line.match(/^([A-Za-z0-9_.-]+):\s*(.+)$/);
      if (match) {
        commands[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
      }
    }
    if (section === 'policy' && line.startsWith('requiredChecks:')) {
      continue;
    }
    if (section === 'policy') {
      const match = line.match(/^-\s+(.+)$/);
      if (match) {
        requiredChecks.push(match[1].trim().replace(/^['"]|['"]$/g, ''));
      }
    }
  }

  if (requiredChecks.length === 0) {
    return '- Populate from the active verification contract before claiming completion.';
  }

  return requiredChecks.map((checkName) => {
    const command = commands[checkName];
    return command
      ? `- ${checkName}: \`${command}\``
      : `- ${checkName}: declare the command in ${verificationContractFile}`;
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
| OBJ-REQ | In-scope requirements covered | 40 | pending | ${phaseQaReport} | REQ-* coverage |
| OBJ-SCN | Critical scenarios evidenced | 30 | pending | ${phaseQaReport} | SCN-* runtime or E2E evidence |
| OBJ-VER | Required verification commands passed | 20 | pending | ${phaseQaReport} | Fresh contract-backed evidence |
| OBJ-CLOSE | Review and finish closeout recorded | 10 | pending | ${phaseQaReport} | Review + finish evidence present |

## Score Summary
- Current score: 0
- Target score: ${targetCompletionScore}
- Unmet checklist items: 4
- Blocking defects: 0
- Verdict: retry

## Loop Policy
- \`done\` requires Current score >= Target score
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
  } = config;
  const paths = assignExecutionArtifactPaths(phaseNum, phaseTitle, executionRoot);
  const requiredCommands = renderRequiredVerificationCommands(verificationContractFile);

  fs.mkdirSync(paths.phaseExecutionDir, { recursive: true });

  if (!fs.existsSync(paths.phaseSprintContract)) {
    const sprint = `# Phase ${paths.phasePrefix} Sprint Contract

> Seeded automatically by \`agent-loop.mjs\`. Refresh before code changes.

## Slice
- Phase: ${phaseNum}
- Title: ${phaseTitle}
- Source plan: ${masterPlan}
- Source phase doc: ${phaseDoc}

## Round Goal
- Fill before code changes.

## Non-Goals
- Fill before code changes.

## Stage Order
- Ready / Isolate
- Execute
- Review
- Verify
- Finish / Handoff

## Planned Changes
- Files/modules:
- Interfaces/contracts:

## Policy Anchors
- Always-loaded rules: AGENTS.md, .claude/CLAUDE.md, .claude/rules/**
- Active workspace contract: ${activeWorkspaceContract(workspaceRoot)}
- Verification contract: ${verificationContractFile}
- Phase-specific guides: .claude/docs/guidelines/long-running-harness.md
- Round policy summary: Keep this run isolated to phase ${paths.phasePrefix}, refresh QA/HANDOFF artifacts when state changes, and require fresh verification evidence before completion.

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
- Fill before runtime verification.

### Artifacts
- QA report: ${paths.phaseQaReport}
- Handoff: ${paths.phaseHandoff}
- Scorecard: ${paths.phaseScorecard}

## Finish Rule
- Clean finish requires: fresh verification evidence, review complete, and finish-stage closeout recorded.
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

## Criteria Review
| Criterion | Result | Notes |
|-----------|--------|-------|
|  | pending |  |

## Findings
| Severity | Area | Reproduction | Expected | Actual |
|----------|------|--------------|----------|--------|
|  |  |  |  |  |

## Runtime Updates
- Seeded at: ${new Date().toISOString().replace('T', ' ').slice(0, 19)}

## Workflow Execution
- Selected bundles: ready-isolate-bundle, implementation-bundle, review-bundle, verification-bundle, finish-bundle
- Applied skills: implementation-runner, completion-verifier
- Skipped skills: codex-review-code (review pending until the first meaningful implementation batch completes), code-simplifier (not evaluated yet), session-logger (clean completion path unless the phase stops without clean completion)
- Enforcement note: replace defaults when actual execution diverges

## Score Summary
- Current score: 0
- Target score: ${targetCompletionScore}
- Unmet checklist items: 1
- Blocking defects: 0
- Verdict: retry

## Finish Readiness
- Fresh evidence confirmed: no
- Why this round may stop now:
- Remaining in-scope work:
- Remaining blockers before closeout:
- Checks to rerun if code changes again:
`;
    fs.writeFileSync(paths.phaseQaReport, `${qa}\n`, 'utf8');
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
   기본 인자만 넣어도 동작합니다.
   예: \`python3 .claude/scripts/write-verification-verdict.py --output .claude/verification-verdict-phase02-final.json --run-id phase02-final --phase-number 2\`
7. Record the exact repository-root verdict path in QA_REPORT.md as \`- Verification verdict file: .claude/verification-verdict-...\`.
8. Update QA_REPORT.md with runtime/mode, review state, and verification evidence.
9. Update SCORECARD.md with objective checklist status, score, unmet items, and verdict.
10. If verification passed, SCORECARD.md says \`Verdict: done\`, and finish-stage conditions are satisfied, stop immediately. If not, update HANDOFF.md and stop.

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
  verificationVerdictGlob: ".claude/verification-verdict-*.json"

Single isolated phase-attempt rules:
- Treat this run as one isolated phase attempt only.
- Set signals.phaseAttemptMode = true.
- Set artifacts.activePhaseDocPath = "${phaseDoc}".
- Reuse the provided execution artifact paths.
- Do not invoke moonshot-phase-runner again.
- Do not expand to other phases.
- Read the Policy Anchors section in SPRINT_CONTRACT.md first.
- Preserve the stage order \`ready/isolate -> execute -> review -> verify -> finish/handoff\`.
- Immediately after reading the active phase doc and SPRINT_CONTRACT.md, write an in-progress checkpoint to QA_REPORT.md and SCORECARD.md before broader inspection or long-running commands.
- Before code edits, refresh SPRINT_CONTRACT.md for this phase.
- Record review completion before claiming the verifier state is final.
- Generate fresh structured verification verdicts with \`.claude/scripts/write-verification-verdict.py\` and write them under \`.claude/verification-verdict-*.json\`; do not hand-author verdict JSON.
  기본 인자만 넣어도 동작하도록 스키마를 완화했습니다.
- Record the exact repository-root verdict path in QA_REPORT.md so the completion gate can confirm the same file.
- Refresh QA_REPORT.md at stage transitions instead of batching every artifact update at the end.
- When verification runs, update QA_REPORT.md.
- Update SCORECARD.md on every meaningful round using objective checklist status, current score, unmet items, and verdict.
- Refresh SCORECARD.md again after verification or any remediation so progress is visible while the phase is still running.
- Refresh the default values in the "Workflow Execution" section of QA_REPORT.md when actual execution diverges.
- In QA_REPORT.md, use only these closeout reason codes: \`scope_complete\`, \`verification_failed\`, \`blocked\`, \`interrupted\`, \`context_limit\`, \`user_pause\`, \`deferred_verification\`.
- If QA_REPORT.md uses \`Next path: retry_loop\`, it must also use \`Closeout reason: verification_failed\`.
- In HANDOFF.md, use only these stop reason codes: \`blocked\`, \`interrupted\`, \`context_limit\`, \`user_pause\`, \`deferred_verification\`.
- If meaningful code changed, record \`code-simplifier\` in Applied skills or Skipped skills with a reason.
- If the run stops without clean completion, update HANDOFF.md, include \`session-logger\` evidence, and list the checks to rerun.
- Do not mark the phase done while SCORECARD.md says \`Verdict: retry\` or \`blocked\`.
- Do not mark the phase done while Current score is below ${targetCompletionScore}, Unmet checklist items > 0, or Blocking defects > 0.

Runtime compatibility fallback:
- If /moonshot-orchestrator is unavailable in this runtime, execute the equivalent phase-attempt workflow directly instead of searching for missing slash skills.
- In fallback mode, use only the active phase doc, SPRINT_CONTRACT.md, QA_REPORT.md, HANDOFF.md, SCORECARD.md, ${activeWorkspaceContract(workspaceRoot)}, .claude/verification.contract.yaml, and .claude/docs/guidelines/long-running-harness.md unless the phase doc explicitly requires more.
- Do not inspect unrelated repository files once the required verification command and artifact updates are clear.
- Once fresh verification evidence exists, the execution artifacts reflect the outcome, and SCORECARD.md says \`Verdict: done\`, stop immediately and return control to the caller.${codexDirectSteps}

Additional instructions:
${extraInstructions}

${autonomousInstructions}`.trimEnd();
}
