#!/usr/bin/env node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  getHeadingAliases,
  scenarioEvidencePassed as normalizeScenarioEvidencePassed,
  sectionText as normalizeSectionText,
} from './artifact-normalizer.mjs';
import { evaluateDemoFirstGate } from './demo-first-gate-lib.mjs';
import { evaluatePathAuthority } from './lib/path-authority.mjs';

const PASS_WORDS = /\b(pass|passed|done|verified)\b/i;
const FAIL_WORDS = /\b(fail|failed|blocked|missing|todo|pending|retry)\b/i;
const EXTERNAL_BLOCKER_WORDS = /\b(external|account|credential|credentials|launch|domain|cloudflare|search console|adsense|manual|no-go)\b/i;

function normalize(value) {
  return String(value || '').replace(/\r\n/g, '\n');
}

function stripQuotes(value) {
  return String(value || '').trim().replace(/^["'`]+|["'`]+$/g, '');
}

function readText(filePath) {
  if (!filePath || !fs.existsSync(filePath)) {
    return '';
  }
  return fs.readFileSync(filePath, 'utf8');
}

function sectionText(text, heading) {
  return normalizeSectionText(text, heading, getHeadingAliases(heading));
}

function parseArgs(argv) {
  const result = {};
  const args = [...argv];
  if (args[0] === 'self-test') {
    return { selfTest: true };
  }
  while (args.length > 0) {
    const arg = args.shift();
    switch (arg) {
      case '--status-file':
        result.statusFile = args.shift() || '';
        break;
      case '--plan-dir':
        result.planDir = args.shift() || '';
        break;
      case '--master-plan':
        result.masterPlan = args.shift() || '';
        result.masterPlanProvided = true;
        break;
      case '--json':
        result.json = true;
        break;
      default:
        throw new Error(`Unknown option: ${arg}`);
    }
  }
  return result;
}

function resolvePath(rawPath, baseDir = process.cwd()) {
  const cleaned = stripQuotes(rawPath);
  if (!cleaned) {
    return '';
  }
  return path.isAbsolute(cleaned) ? cleaned : path.resolve(baseDir, cleaned);
}

function parsePhaseStatus(text) {
  const phases = [];
  const lines = normalize(text).split('\n');
  let current = null;

  for (const line of lines) {
    const start = line.match(/^\s*-\s+number:\s*(\d+)/);
    if (start) {
      if (current) {
        phases.push(current);
      }
      current = { number: Number(start[1]) };
      continue;
    }

    if (!current) {
      continue;
    }

    const field = line.match(/^ {4}([A-Za-z][A-Za-z0-9]*):\s*(.*)$/);
    if (field) {
      current[field[1]] = stripQuotes(field[2]);
    }
  }

  if (current) {
    phases.push(current);
  }

  return phases;
}

function parseMasterChecklist(text) {
  const section = sectionText(text, 'Phase Completion Checklist');
  const result = new Map();

  for (const line of section.split('\n')) {
    const match = line.match(/^-\s+\[([ xX])\].*?Phase\s+0?(\d+)\b/);
    if (match) {
      result.set(Number(match[2]), match[1].toLowerCase() === 'x');
    }
  }

  return result;
}

function parseCriticalScenarios(text) {
  const section = sectionText(text, 'Critical Product Scenarios');
  const scenarios = [];
  const seen = new Set();
  const regex = /\b(SCN-[A-Za-z0-9_.-]+)\b/g;
  let match;

  while ((match = regex.exec(section)) !== null) {
    const id = match[1];
    if (!seen.has(id)) {
      seen.add(id);
      scenarios.push(id);
    }
  }

  return scenarios;
}

function extractPathTokens(text) {
  const result = new Set();
  const regex = /(?:^|[\s`"'(])([A-Za-z0-9_@./\\-]+\.(?:tsx|jsx|ts|js|mjs|cjs|json|yaml|yml|md|sh|py))(?:$|[\s`"',):;])/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    const token = match[1].replace(/\\/g, '/').replace(/^(?:\.\/)+/, '');
    if (!token.includes('..')) {
      result.add(token);
    }
  }
  return [...result];
}

function hasConcreteSourceTargets(phaseText) {
  return extractPathTokens(sectionText(phaseText, 'Exact Execution Targets'))
    .some((token) => !token.endsWith('.md') && !token.endsWith('package.json'));
}

function scenarioEvidencePassed(scenarioId, evidenceText) {
  return normalizeScenarioEvidencePassed(scenarioId, evidenceText) || normalize(evidenceText).split('\n').some((line) => {
    const lowered = line.toLowerCase();
    return lowered.includes(scenarioId.toLowerCase()) && PASS_WORDS.test(line) && !FAIL_WORDS.test(line);
  });
}

function scorecardDone(scorecardText) {
  return /(?:Verdict|Score verdict):\s*done/i.test(scorecardText)
    || /Current task status:\s*FULL/i.test(scorecardText);
}

function readVerdictForPhase(phaseNumber) {
  const phaseId = String(phaseNumber).padStart(2, '0');
  const verdictPath = path.resolve(process.cwd(), `.claude/verification-verdict-phase${phaseId}-final.json`);
  if (!fs.existsSync(verdictPath)) {
    return { path: verdictPath, exists: false };
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(verdictPath, 'utf8'));
    return { path: verdictPath, exists: true, parsed };
  } catch (error) {
    return { path: verdictPath, exists: true, parseError: error.message };
  }
}

function verdictPassed(verdict) {
  if (!verdict.exists || verdict.parseError) {
    return false;
  }
  const parsed = verdict.parsed || {};
  if (!verdictInternallyConsistent(parsed)) {
    return false;
  }
  const scoreVerdict = parsed.score?.verdict;
  return parsed.verdict === 'passed'
    && parsed.evidenceFresh === true
    && parsed.blocking === false
    && (!scoreVerdict || scoreVerdict === 'done');
}

function verdictInternallyConsistent(parsed = {}) {
  const verdict = String(parsed.verdict || '').trim().toLowerCase();
  const scoreVerdict = String(parsed.score?.verdict || '').trim().toLowerCase();
  const commands = Array.isArray(parsed.commands) ? parsed.commands : [];
  const allCommandsPassed = commands.length > 0
    && commands.every((command) => String(command.status || '').trim().toLowerCase() === 'passed');

  if (parsed.blocking === true && verdict === 'passed') {
    return false;
  }
  if (parsed.blocking === true && allCommandsPassed && scoreVerdict === 'done') {
    return false;
  }
  if (verdict === 'passed' && ['blocked', 'retry', 'failed'].includes(scoreVerdict)) {
    return false;
  }
  return true;
}

function unresolvedLocalBlocker(text) {
  return normalize(text).split('\n').some((line) => {
    const relevant =
      /Remaining blockers before closeout:/i.test(line)
      || /Stop reason:\s*(blocked|deferred_verification)/i.test(line)
      || /blocking defects\s*=\s*[1-9]/i.test(line);

    if (!relevant || /\bnone\b/i.test(line)) {
      return false;
    }

    if (/\b(no blocking|blocking defects\s*=\s*0|blocking:\s*false)\b/i.test(line)) {
      return false;
    }

    return !EXTERNAL_BLOCKER_WORDS.test(line);
  });
}

function executionRootFromPhaseArtifact(phase) {
  const candidate = phase.qaReport || phase.sprintContract || phase.handoff || phase.scorecard || '';
  if (!candidate) {
    return '';
  }
  return path.dirname(path.dirname(resolvePath(candidate)));
}

function traceabilityArtifactValid(filePath, idPattern) {
  if (!filePath || !fs.existsSync(filePath)) {
    return false;
  }
  const text = readText(filePath);
  return idPattern.test(text) && /\b(implemented|verified|pass|passed|done)\b/i.test(text);
}

function addViolation(violations, code, message, phaseNumber = null) {
  violations.push({ code, message, phaseNumber });
}

export function evaluatePhaseCloseout(rawConfig = {}) {
  const config = {
    statusFile: rawConfig.statusFile || '.claude/docs/phase-status.yaml',
    planDir: rawConfig.planDir || 'docs/implementation',
    masterPlan: rawConfig.masterPlan || '',
    masterPlanProvided: rawConfig.masterPlanProvided ?? Object.prototype.hasOwnProperty.call(rawConfig, 'masterPlan'),
    executionRoot: rawConfig.executionRoot || '',
  };
  const pathAuthority = evaluatePathAuthority({
    statusFile: config.statusFile,
    planDir: config.planDir,
    masterPlan: config.masterPlan,
    masterPlanProvided: config.masterPlanProvided,
    executionRoot: config.executionRoot,
  });
  const statusPath = pathAuthority.resolvedPaths.statusFile;
  const planDir = pathAuthority.resolvedPaths.planDir;
  const masterPath = pathAuthority.resolvedPaths.masterPlan;
  const violations = pathAuthority.issues.map((issue) => ({
    code: issue.code,
    message: issue.detail,
    phaseNumber: null,
  }));

  const phases = fs.existsSync(statusPath) ? parsePhaseStatus(readText(statusPath)) : [];
  const checklist = fs.existsSync(masterPath) ? parseMasterChecklist(readText(masterPath)) : new Map();

  for (const phase of phases) {
    const phaseNumber = phase.number;
    const completed = phase.status === 'completed';
    const checked = checklist.get(phaseNumber);

    if (completed && checked !== true) {
      addViolation(violations, 'master-checklist-not-checked', `Completed phase ${phaseNumber} is not checked in the master checklist.`, phaseNumber);
    }
    if (checked === true && !completed) {
      addViolation(violations, 'master-checklist-status-mismatch', `Master checklist marks phase ${phaseNumber} complete but phase-status is ${phase.status || 'missing'}.`, phaseNumber);
    }

    if (!completed) {
      continue;
    }

    const requiredArtifactFields = ['sprintContract', 'qaReport', 'handoff', 'scorecard'];
    const artifactTexts = [];
    for (const field of requiredArtifactFields) {
      const artifactPath = resolvePath(phase[field] || '');
      if (!artifactPath || !fs.existsSync(artifactPath)) {
        addViolation(violations, 'artifact_path_missing', `Completed phase ${phaseNumber} is missing ${field}.`, phaseNumber);
      } else {
        artifactTexts.push(readText(artifactPath));
      }
    }

    const archivedPath = resolvePath(phase.archivedPhaseDoc || '');
    if (!archivedPath || !fs.existsSync(archivedPath)) {
      addViolation(violations, 'artifact_path_missing', `Completed phase ${phaseNumber} is missing a valid archivedPhaseDoc.`, phaseNumber);
    }

    const phaseDocText = archivedPath && fs.existsSync(archivedPath) ? readText(archivedPath) : '';
    const scenarios = parseCriticalScenarios(phaseDocText);
    const evidenceText = artifactTexts.join('\n');

    if (phaseDocText && scenarios.length === 0 && hasConcreteSourceTargets(phaseDocText)) {
      addViolation(violations, 'artifact_path_missing', `Completed phase ${phaseNumber} has implementation targets but no Critical Product Scenarios.`, phaseNumber);
    }

    for (const scenarioId of scenarios) {
      if (!scenarioEvidencePassed(scenarioId, evidenceText)) {
        addViolation(violations, 'artifact_path_missing', `Completed phase ${phaseNumber} lacks passing evidence for ${scenarioId}.`, phaseNumber);
      }
    }

    const verdict = readVerdictForPhase(phaseNumber);
    if (verdict.exists && !verdict.parseError && !verdictInternallyConsistent(verdict.parsed || {})) {
      addViolation(violations, 'verification-verdict-inconsistent', `Completed phase ${phaseNumber} has contradictory verdict fields at ${path.relative(process.cwd(), verdict.path)}.`, phaseNumber);
    }
    if (!verdictPassed(verdict)) {
      addViolation(violations, 'verification-verdict-not-passed', `Completed phase ${phaseNumber} does not have a passing fresh verdict at ${path.relative(process.cwd(), verdict.path)}.`, phaseNumber);
    }

    const scorecardText = artifactTexts[3] || '';
    if (!scorecardDone(scorecardText)) {
      addViolation(violations, 'scorecard-not-done', `Completed phase ${phaseNumber} scorecard is not done/FULL.`, phaseNumber);
    }

    const demoFirstGate = evaluateDemoFirstGate({
      phaseExecutionDir: phase.qaReport ? path.dirname(resolvePath(phase.qaReport)) : '',
      sprintContractPath: resolvePath(phase.sprintContract || ''),
      qaReportPath: resolvePath(phase.qaReport || ''),
      scorecardPath: resolvePath(phase.scorecard || ''),
      phaseDocPath: archivedPath,
    });
    if (!demoFirstGate.allowed) {
      addViolation(violations, demoFirstGate.reason, `Completed phase ${phaseNumber} violates demo-first MVP gate for maturity ${demoFirstGate.maturityTarget || 'unknown'}.`, phaseNumber);
    }

    if (unresolvedLocalBlocker(evidenceText)) {
      addViolation(violations, 'unresolved-local-blocker', `Completed phase ${phaseNumber} still contains a local blocker.`, phaseNumber);
    }

    const executionRoot = executionRootFromPhaseArtifact(phase);
    const requirementsPath = executionRoot ? path.join(executionRoot, 'REQUIREMENTS_TRACEABILITY.md') : '';
    const scenarioPath = executionRoot ? path.join(executionRoot, 'SCENARIO_MATRIX.md') : '';
    if (!traceabilityArtifactValid(requirementsPath, /\bREQ-[A-Za-z0-9_.-]+\b/)) {
      addViolation(violations, 'artifact_path_missing', `Completed phase ${phaseNumber} requires ${path.relative(process.cwd(), requirementsPath || 'REQUIREMENTS_TRACEABILITY.md')} with verified REQ-* coverage.`, phaseNumber);
    }
    if (!traceabilityArtifactValid(scenarioPath, /\bSCN-[A-Za-z0-9_.-]+\b/)) {
      addViolation(violations, 'artifact_path_missing', `Completed phase ${phaseNumber} requires ${path.relative(process.cwd(), scenarioPath || 'SCENARIO_MATRIX.md')} with verified SCN-* coverage.`, phaseNumber);
    }
  }

  const allowed = violations.length === 0;
  return {
    allowed,
    status: allowed ? 'pass' : 'fail',
    reason: allowed ? 'ok' : violations[0].code,
    statusFile: statusPath,
    planDir,
    masterPlan: masterPath,
    completedPhases: phases.filter((phase) => phase.status === 'completed').map((phase) => phase.number),
    violations,
  };
}

function printHuman(result) {
  printLine('Phase Closeout Check');
  printLine(`Status: ${result.status}`);
  printLine(`Reason: ${result.reason}`);
  printLine(`Completed phases: ${result.completedPhases.join(', ') || 'none'}`);
  printLine(`Violations: ${result.violations.length}`);
  for (const violation of result.violations) {
    const phase = violation.phaseNumber ? `phase ${violation.phaseNumber}: ` : '';
    printLine(`- ${violation.code}: ${phase}${violation.message}`);
  }
}

function printLine(value) {
  process.stdout.write(`${value}\n`);
}

function writeFixtureFile(root, relativePath, content) {
  const filePath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
}

function writeDemoFirstFixture(root, options = {}) {
  const approvalStatus = options.approvalStatus || 'approved';
  const approvalScope = options.approvalScope === false ? '' : `
  routes:
    - /dashboard
  flows:
    - create_project_success
  states:
    - success
  mockScenarios:
    - create_project_success`;
  const contractParity = options.contractParity || 'pass';
  const evidenceMode = options.evidenceMode || 'real_api';
  const mockOnly = options.mockOnly || 'no';

  writeFixtureFile(root, 'docs/implementation/00-master-plan-v1.md', `# Master

## Phase Completion Checklist
- [x] Phase 01 - Create First Project - Real Functional (\`docs/implementation/01-create-first-project-real-functional-v1.md\`)
`);
  writeFixtureFile(root, '.claude/docs/phase-status.yaml', `phases:
  - number: 1
    status: completed
    sprintContract: docs/implementation/execution/phase01/SPRINT_CONTRACT.md
    qaReport: docs/implementation/execution/phase01/QA_REPORT.md
    handoff: docs/implementation/execution/phase01/HANDOFF.md
    scorecard: docs/implementation/execution/phase01/SCORECARD.md
    archivedPhaseDoc: docs/implementation/01-create-first-project-real-functional-v1.md
`);
  writeFixtureFile(root, 'docs/implementation/01-create-first-project-real-functional-v1.md', `# Phase 01: Create First Project - Real Functional

## Phase Execution Metadata
\`\`\`yaml
mvpMethodology:
  profile: demo_first
  sliceId: create-first-project
  maturityTarget: real_functional
  demoGate:
    required: true
    mode: hard_stop
    approvalSource: "docs/implementation/USER_DEMO_APPROVAL.md"
    evidenceSource: "docs/implementation/DEMO_EVIDENCE.md"
    mockContractSource: "docs/implementation/MOCK_API_CONTRACT.md"
\`\`\`

## Critical Product Scenarios
| ID | User-Visible Expectation | Verification Command | Expected Signal | Evidence Path |
|----|--------------------------|----------------------|-----------------|---------------|
| SCN-01-1 | User creates first project | \`npm test\` | pass | \`docs/implementation/execution/phase01/QA_REPORT.md\` |
`);
  writeFixtureFile(root, 'docs/implementation/execution/REQUIREMENTS_TRACEABILITY.md', 'REQ-01 | pass | verified\n');
  writeFixtureFile(root, 'docs/implementation/execution/SCENARIO_MATRIX.md', 'SCN-01-1 | pass | verified\n');
  writeFixtureFile(root, 'docs/implementation/execution/phase01/SPRINT_CONTRACT.md', `# Sprint

## Demo-first MVP Gate
- Applies: yes
- Profile: demo_first
- Slice ID: create-first-project
- Maturity target: real_functional
- Approval source: docs/implementation/USER_DEMO_APPROVAL.md
- Evidence source: docs/implementation/DEMO_EVIDENCE.md
- Mock contract source: docs/implementation/MOCK_API_CONTRACT.md
`);
  writeFixtureFile(root, 'docs/implementation/execution/phase01/QA_REPORT.md', `# QA

## Verdict
- Status: pass
- Next path: clean_finish
- Closeout reason: scope_complete

## Review Checkpoint
- Review completed: yes

## Demo-first MVP Evidence
- Applies: yes
- Profile: demo_first
- Slice ID: create-first-project
- Maturity target: real_functional
- Demo run command: npm run dev
- Tested routes: /dashboard, /projects/new, /projects/project_1
- Tested flows: create_project_success
- Mock success path: pass
- Mock error path: pass
- Browser/user-flow evidence: pass
- Demo evidence source: docs/implementation/DEMO_EVIDENCE.md
- User approval source: docs/implementation/USER_DEMO_APPROVAL.md
- User approval status: ${approvalStatus}
- Approved scope present: ${approvalScope ? 'yes' : 'no'}
- Mock contract source: docs/implementation/MOCK_API_CONTRACT.md
- Contract parity: ${contractParity}
- Evidence mode: ${evidenceMode}
- Mock-only evidence: ${mockOnly}

SCN-01-1 | pass | docs/implementation/execution/phase01/QA_REPORT.md

## Workflow Execution
- Selected bundles: ready-isolate-bundle, implementation-bundle, review-bundle, verification-bundle, finish-bundle
- Applied skills: implementation-runner, codex-review-code, completion-verifier
- Skipped skills: none

## Finish Readiness
- Why this round may stop now: scope complete
- Remaining in-scope work: none
- Remaining blockers before closeout: none
`);
  writeFixtureFile(root, 'docs/implementation/execution/phase01/HANDOFF.md', '# Handoff\n\n- Stop reason: none\n');
  writeFixtureFile(root, 'docs/implementation/execution/phase01/SCORECARD.md', '# Scorecard\n\n- Verdict: done\n- Current task status: FULL\n');
  writeFixtureFile(root, 'docs/implementation/USER_DEMO_APPROVAL.md', `approval: ${approvalStatus}
approvedAt: "2026-05-06T00:00:00+09:00"
approvedBy: user
approvedScope:
  sliceId: create-first-project
  maturityTarget: mock_functional_demo${approvalScope}
knownIssues: []
blockedChanges:
  - approved_routes_change
requiresReapprovalIf:
  - route_structure_changes
`);
  writeFixtureFile(root, 'docs/implementation/DEMO_EVIDENCE.md', `# Demo Evidence

- Demo run command: npm run dev
- Tested routes: /dashboard, /projects/new, /projects/project_1
`);
  writeFixtureFile(root, 'docs/implementation/MOCK_API_CONTRACT.md', '# Mock API Contract\n\nPOST /api/projects\n');
  writeFixtureFile(root, '.claude/verification-verdict-phase01-final.json', JSON.stringify({
    verdict: 'passed',
    evidenceFresh: true,
    blocking: false,
    commands: [{ name: 'fixture', status: 'passed' }],
    score: { verdict: 'done' },
  }, null, 2));
}

function runSelfTest() {
  const originalCwd = process.cwd();
  const tempRoots = [];
  const makeTempRoot = (prefix) => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
    tempRoots.push(tempRoot);
    return tempRoot;
  };
  const root = makeTempRoot('phase-closeout-demo-first-');
  try {
    writeDemoFirstFixture(root);
    process.chdir(root);
    const passing = evaluatePhaseCloseout({
      statusFile: '.claude/docs/phase-status.yaml',
      planDir: 'docs/implementation',
    });
    if (!passing.allowed) {
      throw new Error(`expected passing demo-first fixture, got ${passing.reason}`);
    }

    const failingRoot = makeTempRoot('phase-closeout-demo-first-fail-');
    writeDemoFirstFixture(failingRoot, { approvalStatus: 'pending' });
    process.chdir(failingRoot);
    const failing = evaluatePhaseCloseout({
      statusFile: '.claude/docs/phase-status.yaml',
      planDir: 'docs/implementation',
    });
    if (failing.allowed || failing.reason !== 'user_validation_required') {
      throw new Error(`expected user_validation_required, got ${failing.reason}`);
    }

    const parityRoot = makeTempRoot('phase-closeout-demo-first-parity-');
    writeDemoFirstFixture(parityRoot, { contractParity: 'fail' });
    process.chdir(parityRoot);
    const parity = evaluatePhaseCloseout({
      statusFile: '.claude/docs/phase-status.yaml',
      planDir: 'docs/implementation',
    });
    if (parity.allowed || parity.reason !== 'contract_parity_failed') {
      throw new Error(`expected contract_parity_failed, got ${parity.reason}`);
    }

    const mockRoot = makeTempRoot('phase-closeout-demo-first-mock-');
    writeFixtureFile(mockRoot, 'docs/implementation/execution/phase01/SPRINT_CONTRACT.md', `# Sprint

## Demo-first MVP Gate
- Applies: yes
- Profile: demo_first
- Maturity target: mock_functional_demo
`);
    writeFixtureFile(mockRoot, 'docs/implementation/execution/phase01/QA_REPORT.md', `# QA

## Demo-first MVP Evidence
- Applies: yes
- Profile: demo_first
- Maturity target: mock_functional_demo
- Mock success path: pass
- Mock error path: pending
`);
    const mockGate = evaluateDemoFirstGate({
      baseDir: mockRoot,
      phaseExecutionDir: path.join(mockRoot, 'docs/implementation/execution/phase01'),
    });
    if (mockGate.allowed || mockGate.reason !== 'mock-functional-demo-evidence-missing') {
      throw new Error(`expected mock-functional-demo-evidence-missing, got ${mockGate.reason}`);
    }

    const evidenceRoot = makeTempRoot('phase-closeout-demo-first-evidence-');
    writeFixtureFile(evidenceRoot, 'docs/implementation/execution/phase01/SPRINT_CONTRACT.md', `# Sprint

## Demo-first MVP Gate
- Applies: yes
- Profile: demo_first
- Maturity target: demo_evidence_capture
`);
    writeFixtureFile(evidenceRoot, 'docs/implementation/execution/phase01/QA_REPORT.md', `# QA

## Demo-first MVP Evidence
- Applies: yes
- Profile: demo_first
- Maturity target: demo_evidence_capture
- Demo run command:
- Tested routes:
`);
    const evidenceGate = evaluateDemoFirstGate({
      baseDir: evidenceRoot,
      phaseExecutionDir: path.join(evidenceRoot, 'docs/implementation/execution/phase01'),
    });
    if (evidenceGate.allowed || evidenceGate.reason !== 'demo-evidence-missing') {
      throw new Error(`expected demo-evidence-missing, got ${evidenceGate.reason}`);
    }

    printLine('verify-phase-closeout self-test passed');
  } finally {
    process.chdir(originalCwd);
    for (const tempRoot of tempRoots) {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  }
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.selfTest) {
    runSelfTest();
    return;
  }
  const result = evaluatePhaseCloseout(options);
  if (options.json) {
    printLine(JSON.stringify(result, null, 2));
  } else {
    printHuman(result);
  }
  process.exit(result.allowed ? 0 : 1);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  try {
    main();
  } catch (error) {
    console.error(`ERROR: ${error.message}`);
    process.exit(64);
  }
}
