import fs from 'node:fs';
import path from 'node:path';

const REAL_FUNCTIONAL_TARGETS = new Set([
  'real_functional',
  'real_functional_verification',
  'production_hardening',
]);

function readText(filePath) {
  if (!filePath || !fs.existsSync(filePath)) {
    return '';
  }
  return fs.readFileSync(filePath, 'utf8');
}

function stripQuotes(value) {
  return String(value || '').trim().replace(/^["'`]+|["'`]+$/g, '');
}

function extractValue(text, label) {
  const escaped = String(label).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const patterns = [
    new RegExp(`^-\\s*${escaped}:\\s*(.*)$`, 'mi'),
    new RegExp(`^\\s*${escaped}:\\s*(.*)$`, 'mi'),
  ];
  for (const pattern of patterns) {
    const match = String(text || '').match(pattern);
    if (match) {
      return stripQuotes(match[1]);
    }
  }
  return '';
}

function extractYamlScalar(text, key) {
  const escaped = String(key).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = String(text || '').match(new RegExp(`^\\s*${escaped}:\\s*["']?([^"'\n#]+)`, 'mi'));
  return match ? stripQuotes(match[1]) : '';
}

function normalizeStatus(value) {
  return String(value || '').trim().toLowerCase().replace(/^["']|["']$/g, '');
}

function isPass(value) {
  return /\b(pass|passed|done|verified|yes)\b/i.test(String(value || ''));
}

function hasNonEmptyValue(value) {
  const normalized = stripQuotes(value);
  return Boolean(normalized)
    && !/^(none|null|n\/a|na|pending|todo|\[\]|\{\})$/i.test(normalized);
}

function countYamlListItems(text, key) {
  const lines = String(text || '').split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const match = line.match(new RegExp(`^(\\s*)${key}:\\s*(.*)$`));
    if (!match) {
      continue;
    }

    const inline = stripQuotes(match[2]);
    if (/^\[.*\]$/.test(inline)) {
      return inline
        .replace(/^\[|\]$/g, '')
        .split(',')
        .map((item) => stripQuotes(item))
        .filter(hasNonEmptyValue).length;
    }
    if (hasNonEmptyValue(inline)) {
      return 1;
    }

    const baseIndent = match[1].length;
    let count = 0;
    for (let probe = index + 1; probe < lines.length; probe += 1) {
      const next = lines[probe];
      if (!next.trim()) {
        continue;
      }
      const indent = next.length - next.trimStart().length;
      if (indent <= baseIndent) {
        break;
      }
      const item = next.trim().match(/^-\s*(.*)$/);
      if (item && hasNonEmptyValue(item[1])) {
        count += 1;
      }
    }
    return count;
  }
  return 0;
}

function approvalScopePresent(approvalText) {
  return ['routes', 'flows', 'states', 'mockScenarios'].some((key) => countYamlListItems(approvalText, key) > 0);
}

function resolveArtifactPath(rawPath, baseDir = process.cwd()) {
  const cleaned = stripQuotes(rawPath);
  if (!cleaned) {
    return '';
  }
  return path.isAbsolute(cleaned) ? cleaned : path.resolve(baseDir, cleaned);
}

function inferMaturityTarget(text) {
  return normalizeStatus(extractValue(text, 'Maturity target')
    || extractYamlScalar(text, 'maturityTarget'));
}

export function evaluateDemoFirstGate(rawConfig = {}) {
  const phaseExecutionDir = rawConfig.phaseExecutionDir || '';
  const baseDir = rawConfig.baseDir || process.cwd();
  const artifactTexts = [
    readText(rawConfig.sprintContractPath || (phaseExecutionDir ? path.join(phaseExecutionDir, 'SPRINT_CONTRACT.md') : '')),
    readText(rawConfig.qaReportPath || (phaseExecutionDir ? path.join(phaseExecutionDir, 'QA_REPORT.md') : '')),
    readText(rawConfig.scorecardPath || (phaseExecutionDir ? path.join(phaseExecutionDir, 'SCORECARD.md') : '')),
    readText(rawConfig.phaseDocPath || ''),
    rawConfig.extraText || '',
  ];
  const combinedText = artifactTexts.join('\n');
  const applies = /profile:\s*["']?demo_first["']?/i.test(combinedText)
    || /Profile:\s*demo_first/i.test(combinedText)
    || /Demo-first MVP Gate[\s\S]*?Applies:\s*yes/i.test(combinedText)
    || /Demo-first MVP Evidence[\s\S]*?Applies:\s*yes/i.test(combinedText);

  if (!applies) {
    return {
      applies: false,
      allowed: true,
      reason: 'not_applicable',
      maturityTarget: '',
      approvalStatus: '',
      approvedScopePresent: false,
    };
  }

  const maturityTarget = inferMaturityTarget(combinedText) || 'demo_ready_ui';
  const approvalSource = extractValue(combinedText, 'User approval source')
    || extractValue(combinedText, 'Approval source')
    || extractYamlScalar(combinedText, 'approvalSource')
    || 'docs/implementation/USER_DEMO_APPROVAL.md';
  const evidenceSource = extractValue(combinedText, 'Demo evidence source')
    || extractValue(combinedText, 'Evidence source')
    || extractYamlScalar(combinedText, 'evidenceSource')
    || 'docs/implementation/DEMO_EVIDENCE.md';
  const mockContractSource = extractValue(combinedText, 'Mock contract source')
    || extractYamlScalar(combinedText, 'mockContractSource')
    || 'docs/implementation/MOCK_API_CONTRACT.md';

  const approvalPath = resolveArtifactPath(approvalSource, baseDir);
  const evidencePath = resolveArtifactPath(evidenceSource, baseDir);
  const mockContractPath = resolveArtifactPath(mockContractSource, baseDir);
  const approvalText = readText(approvalPath);
  const evidenceText = readText(evidencePath);
  const approvalStatus = normalizeStatus(extractYamlScalar(approvalText, 'approval')
    || extractValue(combinedText, 'User approval status'));
  const approvedScope = approvalScopePresent(approvalText)
    || /^yes$/i.test(extractValue(combinedText, 'Approved scope present'));
  const demoRunCommand = extractValue(combinedText, 'Demo run command') || extractValue(evidenceText, 'Demo run command');
  const testedRoutes = extractValue(combinedText, 'Tested routes') || extractValue(evidenceText, 'Tested routes');
  const testedFlows = extractValue(combinedText, 'Tested flows') || extractValue(evidenceText, 'Tested flows');
  const mockSuccess = extractValue(combinedText, 'Mock success path');
  const mockError = extractValue(combinedText, 'Mock error path');
  const contractParity = extractValue(combinedText, 'Contract parity');
  const evidenceMode = normalizeStatus(extractValue(combinedText, 'Evidence mode'));
  const mockOnlyEvidence = /^yes$/i.test(extractValue(combinedText, 'Mock-only evidence'))
    || evidenceMode === 'mock_only';
  const uiInvalidated = /^yes$/i.test(extractValue(combinedText, 'UI approval invalidated'))
    || approvalStatus === 'invalidated';

  if (uiInvalidated) {
    return {
      applies: true,
      allowed: false,
      reason: 'demo-approval-invalidated',
      maturityTarget,
      approvalStatus,
      approvedScopePresent: approvedScope,
      approvalPath,
      evidencePath,
      mockContractPath,
    };
  }

  if (maturityTarget === 'mock_functional_demo' && (!isPass(mockSuccess) || !isPass(mockError))) {
    return {
      applies: true,
      allowed: false,
      reason: 'mock-functional-demo-evidence-missing',
      maturityTarget,
      approvalStatus,
      approvedScopePresent: approvedScope,
      approvalPath,
      evidencePath,
      mockContractPath,
    };
  }

  if (maturityTarget === 'demo_evidence_capture' && (!hasNonEmptyValue(demoRunCommand) || (!hasNonEmptyValue(testedRoutes) && !hasNonEmptyValue(testedFlows)))) {
    return {
      applies: true,
      allowed: false,
      reason: 'demo-evidence-missing',
      maturityTarget,
      approvalStatus,
      approvedScopePresent: approvedScope,
      approvalPath,
      evidencePath,
      mockContractPath,
    };
  }

  if (maturityTarget === 'user_demo_approval' || REAL_FUNCTIONAL_TARGETS.has(maturityTarget)) {
    if (approvalStatus !== 'approved') {
      return {
        applies: true,
        allowed: false,
        reason: 'user_validation_required',
        maturityTarget,
        approvalStatus,
        approvedScopePresent: approvedScope,
        approvalPath,
        evidencePath,
        mockContractPath,
      };
    }
    if (!approvedScope) {
      return {
        applies: true,
        allowed: false,
        reason: 'demo-approval-scope-empty',
        maturityTarget,
        approvalStatus,
        approvedScopePresent: approvedScope,
        approvalPath,
        evidencePath,
        mockContractPath,
      };
    }
  }

  if (REAL_FUNCTIONAL_TARGETS.has(maturityTarget)) {
    if (mockOnlyEvidence) {
      return {
        applies: true,
        allowed: false,
        reason: 'real-functional-mock-only-evidence',
        maturityTarget,
        approvalStatus,
        approvedScopePresent: approvedScope,
        approvalPath,
        evidencePath,
        mockContractPath,
      };
    }
    if (!isPass(contractParity)) {
      return {
        applies: true,
        allowed: false,
        reason: 'contract_parity_failed',
        maturityTarget,
        approvalStatus,
        approvedScopePresent: approvedScope,
        approvalPath,
        evidencePath,
        mockContractPath,
      };
    }
  }

  return {
    applies: true,
    allowed: true,
    reason: 'ok',
    maturityTarget,
    approvalStatus,
    approvedScopePresent: approvedScope,
    approvalPath,
    evidencePath,
    mockContractPath,
  };
}
