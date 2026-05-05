#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  getHeadingAliases,
  scenarioEvidencePassed as normalizeScenarioEvidencePassed,
  sectionText as normalizeSectionText,
} from './artifact-normalizer.mjs';

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
  };
  const statusPath = resolvePath(config.statusFile);
  const planDir = resolvePath(config.planDir);
  const masterPath = resolvePath(config.masterPlan || path.join(config.planDir, '00-master-plan-v1.md'));
  const violations = [];

  if (!fs.existsSync(statusPath)) {
    addViolation(violations, 'phase-status-missing', `Phase status file is missing: ${config.statusFile}`);
  }
  if (!fs.existsSync(planDir)) {
    addViolation(violations, 'plan-dir-missing', `Plan directory is missing: ${config.planDir}`);
  }
  if (!fs.existsSync(masterPath)) {
    addViolation(violations, 'master-plan-missing', `Master plan is missing: ${config.masterPlan || masterPath}`);
  }

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
        addViolation(violations, 'execution-artifact-missing', `Completed phase ${phaseNumber} is missing ${field}.`, phaseNumber);
      } else {
        artifactTexts.push(readText(artifactPath));
      }
    }

    const archivedPath = resolvePath(phase.archivedPhaseDoc || '');
    if (!archivedPath || !fs.existsSync(archivedPath)) {
      addViolation(violations, 'archived-phase-doc-missing', `Completed phase ${phaseNumber} is missing a valid archivedPhaseDoc.`, phaseNumber);
    }

    const phaseDocText = archivedPath && fs.existsSync(archivedPath) ? readText(archivedPath) : '';
    const scenarios = parseCriticalScenarios(phaseDocText);
    const evidenceText = artifactTexts.join('\n');

    if (phaseDocText && scenarios.length === 0 && hasConcreteSourceTargets(phaseDocText)) {
      addViolation(violations, 'critical-product-scenarios-missing', `Completed phase ${phaseNumber} has implementation targets but no Critical Product Scenarios.`, phaseNumber);
    }

    for (const scenarioId of scenarios) {
      if (!scenarioEvidencePassed(scenarioId, evidenceText)) {
        addViolation(violations, 'critical-scenario-evidence-missing', `Completed phase ${phaseNumber} lacks passing evidence for ${scenarioId}.`, phaseNumber);
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

    if (unresolvedLocalBlocker(evidenceText)) {
      addViolation(violations, 'unresolved-local-blocker', `Completed phase ${phaseNumber} still contains a local blocker.`, phaseNumber);
    }

    const executionRoot = executionRootFromPhaseArtifact(phase);
    const requirementsPath = executionRoot ? path.join(executionRoot, 'REQUIREMENTS_TRACEABILITY.md') : '';
    const scenarioPath = executionRoot ? path.join(executionRoot, 'SCENARIO_MATRIX.md') : '';
    if (!traceabilityArtifactValid(requirementsPath, /\bREQ-[A-Za-z0-9_.-]+\b/)) {
      addViolation(violations, 'requirements-traceability-missing', `Completed phase ${phaseNumber} requires ${path.relative(process.cwd(), requirementsPath || 'REQUIREMENTS_TRACEABILITY.md')} with verified REQ-* coverage.`, phaseNumber);
    }
    if (!traceabilityArtifactValid(scenarioPath, /\bSCN-[A-Za-z0-9_.-]+\b/)) {
      addViolation(violations, 'scenario-matrix-missing', `Completed phase ${phaseNumber} requires ${path.relative(process.cwd(), scenarioPath || 'SCENARIO_MATRIX.md')} with verified SCN-* coverage.`, phaseNumber);
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

function main() {
  const options = parseArgs(process.argv.slice(2));
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
