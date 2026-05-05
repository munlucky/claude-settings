#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  extractBulletValue as normalizeExtractBulletValue,
  getHeadingAliases,
  scenarioEvidencePassed as normalizeScenarioEvidencePassed,
  sectionText as normalizeSectionText,
} from './artifact-normalizer.mjs';

const DEFERRED_TERMS = [
  'deferred',
  'not introduced',
  'without adding',
  'residual risk',
  'defer',
  'alternative implementation',
  'workaround',
  '보류',
  '미구현',
  '우회',
];

function normalize(value) {
  return String(value || '').replace(/\r\n/g, '\n');
}

function normalizeInline(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
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

function extractBulletValue(text, heading, label) {
  return normalizeExtractBulletValue(text, heading, label, getHeadingAliases(heading));
}

function parseArgs(argv) {
  const result = {};
  const args = [...argv];
  while (args.length > 0) {
    const arg = args.shift();
    switch (arg) {
      case '--phase-doc':
        result.phaseDocPath = args.shift() || '';
        break;
      case '--sprint-contract':
        result.sprintContractPath = args.shift() || '';
        break;
      case '--qa-report':
        result.qaReportPath = args.shift() || '';
        break;
      case '--scorecard':
        result.scorecardPath = args.shift() || '';
        break;
      case '--handoff':
        result.handoffPath = args.shift() || '';
        break;
      case '--json':
        result.json = true;
        break;
      case '--env':
        result.env = true;
        break;
      default:
        throw new Error(`Unknown option: ${arg}`);
    }
  }
  return result;
}

function shellQuote(value) {
  return `'${String(value ?? '').replace(/'/g, `'\\''`)}'`;
}

function inferExecutionDir(config) {
  for (const candidate of [config.sprintContractPath, config.qaReportPath, config.scorecardPath, config.handoffPath]) {
    if (candidate) {
      return path.dirname(candidate);
    }
  }
  return '';
}

function inferPathFromExecutionDir(config, fileName) {
  const executionDir = inferExecutionDir(config);
  if (!executionDir) {
    return '';
  }
  return path.join(executionDir, fileName);
}

function resolveExistingPath(rawPath, baseDir = process.cwd()) {
  const cleaned = String(rawPath || '').trim().replace(/^["'`]+|["'`]+$/g, '');
  if (!cleaned) {
    return '';
  }
  if (path.isAbsolute(cleaned)) {
    return cleaned;
  }
  const baseRelative = path.resolve(baseDir, cleaned);
  if (fs.existsSync(baseRelative)) {
    return baseRelative;
  }
  return path.resolve(process.cwd(), cleaned);
}

function inferPhaseDocPath(config, sprintText) {
  if (config.phaseDocPath) {
    return config.phaseDocPath;
  }
  const sourcePhaseDoc = extractBulletValue(sprintText, 'Slice', 'Source phase doc')
    || extractBulletValue(sprintText, 'Slice', 'Phase document');
  const explicitPath = resolveExistingPath(sourcePhaseDoc, path.dirname(config.sprintContractPath || process.cwd()));
  if (explicitPath && fs.existsSync(explicitPath)) {
    return explicitPath;
  }

  const executionDir = inferExecutionDir(config);
  const executionBase = executionDir ? path.basename(executionDir) : '';
  const planDir = executionDir ? path.dirname(path.dirname(executionDir)) : '';
  if (executionBase && planDir && fs.existsSync(planDir)) {
    const exactCandidate = path.join(planDir, `${executionBase}.md`);
    if (fs.existsSync(exactCandidate)) {
      return exactCandidate;
    }
    const phasePrefix = executionBase.match(/^([0-9]{1,3})-/)?.[1] || '';
    const candidates = fs.readdirSync(planDir)
      .filter((entry) => entry.endsWith('.md') && (entry.startsWith(`${executionBase}-`) || (phasePrefix && entry.startsWith(`${phasePrefix}-`))))
      .sort();
    if (candidates.length > 0) {
      return path.join(planDir, candidates[0]);
    }
  }

  return explicitPath;
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

function exactTargetLines(sourceText) {
  const exact = sectionText(sourceText, 'Exact Execution Targets');
  return exact.split('\n')
    .map((line) => normalizeInline(line.replace(/^\s*[-|]\s*/, '')))
    .filter((line) => {
      if (!line || /^[-|\s]+$/.test(line)) {
        return false;
      }
      if (/^(Task|ID)\s*\|/i.test(line)) {
        return false;
      }
      if (/\bfiles to create\b.*\bfiles to modify\b.*\bexpected/i.test(line)) {
        return false;
      }
      return true;
    });
}

function sourceRequiresPackage(sourceText, packageName) {
  const exact = sectionText(sourceText, 'Exact Execution Targets');
  const scope = sectionText(sourceText, 'Scope');
  const combined = `${exact}\n${scope}`;
  return new RegExp(`\\b${packageName}\\b`, 'i').test(combined);
}

function packageDependencyPresent(packageJsonPath, dependencyName) {
  if (!packageJsonPath || !fs.existsSync(packageJsonPath)) {
    return false;
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    return Boolean(parsed.dependencies?.[dependencyName] || parsed.devDependencies?.[dependencyName] || parsed.peerDependencies?.[dependencyName]);
  } catch {
    return false;
  }
}

function findPackageJsonForSource(sourceText) {
  const packageTargets = extractPathTokens(sectionText(sourceText, 'Exact Execution Targets'))
    .filter((token) => token.endsWith('package.json'));
  for (const token of packageTargets) {
    const candidate = path.resolve(process.cwd(), token);
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return '';
}

function approvedDeviationPresent(contractText, qaText) {
  const ledger = `${sectionText(contractText, 'Spec Deviation Ledger')}\n${sectionText(qaText, 'Plan Conformance Review')}`;
  return /user-approved-replan|approved:\s*yes|approval:\s*user|phase document updated|phase doc updated/i.test(ledger);
}

function hasCompletionClaim(qaText, scorecardText, handoffText) {
  const qaNextPath = extractBulletValue(qaText, 'Verdict', 'Next path').toLowerCase();
  const qaScope = extractBulletValue(qaText, 'Verdict', 'Scope status').toLowerCase();
  const scoreVerdict = extractBulletValue(scorecardText, 'Score Summary', 'Verdict').toLowerCase()
    || extractBulletValue(scorecardText, 'Score Summary', 'Score verdict').toLowerCase();
  const taskStatus = extractBulletValue(scorecardText, 'Task-Level Status Adapter', 'Current task status').toUpperCase();
  const handoffStop = extractBulletValue(handoffText, 'Resume Trigger', 'Stop reason').toLowerCase();
  const handoffRequired = extractBulletValue(handoffText, 'Status', 'Required').toLowerCase();
  return qaNextPath === 'clean_finish'
    || qaScope === 'complete'
    || scoreVerdict === 'done'
    || taskStatus === 'FULL'
    || handoffStop === 'phase_complete'
    || handoffStop === 'clean_finish'
    || handoffRequired === 'no';
}

function textHasDeferredTerm(text) {
  const lowered = text.toLowerCase();
  return DEFERRED_TERMS.some((term) => lowered.includes(term));
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

function scenarioEvidencePassed(scenarioId, evidenceText) {
  return normalizeScenarioEvidencePassed(scenarioId, evidenceText);
}

function hasConcreteSourceTargets(sourceText) {
  return extractPathTokens(sectionText(sourceText, 'Exact Execution Targets'))
    .some((token) => !token.endsWith('.md') && !token.endsWith('package.json'));
}

function buildViolation(message, code = 'plan-conformance-failed') {
  return { code, message };
}

export function evaluatePlanConformance(rawConfig = {}) {
  const config = {
    ...rawConfig,
    sprintContractPath: rawConfig.sprintContractPath || inferPathFromExecutionDir(rawConfig, 'SPRINT_CONTRACT.md'),
    qaReportPath: rawConfig.qaReportPath || inferPathFromExecutionDir(rawConfig, 'QA_REPORT.md'),
    scorecardPath: rawConfig.scorecardPath || inferPathFromExecutionDir(rawConfig, 'SCORECARD.md'),
    handoffPath: rawConfig.handoffPath || inferPathFromExecutionDir(rawConfig, 'HANDOFF.md'),
  };

  const sprintText = readText(config.sprintContractPath);
  const phaseDocPath = inferPhaseDocPath(config, sprintText);
  const phaseText = readText(phaseDocPath);
  const qaText = readText(config.qaReportPath);
  const scorecardText = readText(config.scorecardPath);
  const handoffText = readText(config.handoffPath);
  const combinedEvidence = `${sprintText}\n${qaText}\n${scorecardText}\n${handoffText}`;
  const completionClaim = hasCompletionClaim(qaText, scorecardText, handoffText);
  const approvedDeviation = approvedDeviationPresent(sprintText, qaText);
  const violations = [];
  const warnings = [];

  if (!config.sprintContractPath || !fs.existsSync(config.sprintContractPath)) {
    violations.push(buildViolation('SPRINT_CONTRACT.md is missing.', 'sprint-contract-missing'));
  }

  if (!phaseDocPath || !fs.existsSync(phaseDocPath)) {
    violations.push(buildViolation('Source phase document is missing or not referenced by the sprint contract.', 'source-phase-doc-missing'));
  }

  if (!sectionText(sprintText, 'Source Plan Requirements Snapshot')) {
    violations.push(buildViolation('SPRINT_CONTRACT.md must preserve ## Source Plan Requirements Snapshot.', 'source-plan-snapshot-missing'));
  }

  if (!sectionText(sprintText, 'Spec Deviation Ledger')) {
    violations.push(buildViolation('SPRINT_CONTRACT.md must include ## Spec Deviation Ledger.', 'spec-deviation-ledger-missing'));
  }

  if (!sectionText(qaText, 'Plan Conformance Review')) {
    violations.push(buildViolation('QA_REPORT.md must include ## Plan Conformance Review.', 'qa-plan-conformance-review-missing'));
  }

  if (!/OBJ-CONFORM/i.test(scorecardText)) {
    violations.push(buildViolation('SCORECARD.md must include OBJ-CONFORM.', 'scorecard-conformance-objective-missing'));
  }

  if (phaseText) {
    const criticalScenarios = parseCriticalScenarios(phaseText);
    const exactLines = exactTargetLines(phaseText);
    const snapshot = sectionText(sprintText, 'Source Plan Requirements Snapshot');
    for (const line of exactLines) {
      const pathTokens = extractPathTokens(line);
      const signalLike = /expected signal|compiles|build|test|pass|fail|creates|modifies/i.test(line);
      if (!signalLike && pathTokens.length === 0) {
        continue;
      }
      const lineFingerprint = normalizeInline(line).toLowerCase();
      const preservedByPath = pathTokens.some((token) => snapshot.replace(/\\/g, '/').includes(token));
      if (!snapshot.toLowerCase().includes(lineFingerprint) && !preservedByPath) {
        violations.push(buildViolation(`Source exact target is not preserved in sprint contract snapshot: ${line}`, 'source-exact-target-not-preserved'));
      }
    }

    const sourcePaths = extractPathTokens(sectionText(phaseText, 'Exact Execution Targets'));
    for (const token of sourcePaths) {
      if (token.endsWith('package.json')) {
        continue;
      }
      if (token.match(/\.(?:tsx|jsx|ts|js|mjs|cjs|json|yaml|yml|sh|py)$/)) {
        const candidate = path.resolve(process.cwd(), token);
        if (!fs.existsSync(candidate) && completionClaim && !approvedDeviation) {
          violations.push(buildViolation(`Required source target file does not exist: ${token}`, 'required-target-file-missing'));
        }
      }
    }

    const packageJsonPath = findPackageJsonForSource(phaseText);
    for (const packageName of ['ink', 'react']) {
      if (sourceRequiresPackage(phaseText, packageName) && completionClaim && !packageDependencyPresent(packageJsonPath, packageName) && !approvedDeviation) {
        violations.push(buildViolation(`Source phase requires ${packageName}, but package dependency is not present.`, 'required-package-missing'));
      }
    }

    const exactTargetText = sectionText(phaseText, 'Exact Execution Targets');
    if (/Ink app compiles/i.test(exactTargetText) && completionClaim && !/Ink app compiles/i.test(combinedEvidence) && !approvedDeviation) {
      violations.push(buildViolation('Source phase expected signal "Ink app compiles" is not evidenced.', 'expected-signal-missing'));
    }

    if (completionClaim && criticalScenarios.length === 0 && hasConcreteSourceTargets(phaseText) && !approvedDeviation) {
      violations.push(buildViolation('Source phase has implementation targets but no Critical Product Scenarios evidence contract.', 'critical-product-scenarios-missing'));
    }

    for (const scenarioId of criticalScenarios) {
      if (completionClaim && !scenarioEvidencePassed(scenarioId, combinedEvidence) && !approvedDeviation) {
        violations.push(buildViolation(`Critical product scenario lacks passing evidence: ${scenarioId}`, 'critical-scenario-evidence-missing'));
      }
    }
  }

  if (completionClaim && textHasDeferredTerm(`${qaText}\n${scorecardText}\n${handoffText}`) && !approvedDeviation) {
    violations.push(buildViolation('Completion artifacts contain deferred or alternative-implementation language without user-approved replan.', 'unapproved-deferred-scope'));
  }

  if (!completionClaim && violations.length > 0) {
    warnings.push('Plan conformance is incomplete; completion remains blocked until fixed.');
  }

  const allowed = violations.length === 0;
  return {
    allowed,
    status: allowed ? 'pass' : 'fail',
    reason: allowed ? 'ok' : violations[0].code,
    phaseDocPath,
    sprintContractPath: config.sprintContractPath,
    qaReportPath: config.qaReportPath,
    scorecardPath: config.scorecardPath,
    handoffPath: config.handoffPath,
    completionClaim,
    approvedDeviation,
    violations,
    warnings,
  };
}

function printHuman(result) {
  printLine('Plan Conformance Check');
  printLine(`Status: ${result.status}`);
  printLine(`Reason: ${result.reason}`);
  printLine(`Phase doc: ${result.phaseDocPath || 'missing'}`);
  printLine(`Sprint contract: ${result.sprintContractPath || 'missing'}`);
  printLine(`Completion claim: ${result.completionClaim ? 'yes' : 'no'}`);
  printLine(`Approved deviation: ${result.approvedDeviation ? 'yes' : 'no'}`);
  printLine(`Violations: ${result.violations.length}`);
  for (const violation of result.violations) {
    printLine(`- ${violation.code}: ${violation.message}`);
  }
  if (result.warnings.length > 0) {
    printLine(`Warnings: ${result.warnings.length}`);
    for (const warning of result.warnings) {
      printLine(`- ${warning}`);
    }
  }
}

function printEnv(result) {
  printLine(`PLAN_CONFORMANCE_ALLOWED=${shellQuote(result.allowed ? 'true' : 'false')}`);
  printLine(`PLAN_CONFORMANCE_REASON=${shellQuote(result.reason)}`);
  printLine(`PLAN_CONFORMANCE_VIOLATIONS=${shellQuote(result.violations.map((item) => `${item.code}: ${item.message}`).join('\n'))}`);
}

function printLine(value) {
  process.stdout.write(`${value}\n`);
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const result = evaluatePlanConformance(options);
  if (options.json) {
    printLine(JSON.stringify(result, null, 2));
  } else if (options.env) {
    printEnv(result);
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
