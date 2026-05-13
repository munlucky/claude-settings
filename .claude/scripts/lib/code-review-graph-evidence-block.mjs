import fs from 'node:fs';
import path from 'node:path';

export const EVIDENCE_BLOCK_BEGIN = '# code-review-graph-stage:begin';
export const EVIDENCE_BLOCK_END = '# code-review-graph-stage:end';

export function normalizeStage(value) {
  const stage = String(value || '').trim();
  const valid = new Set(['plan', 'execute', 'review', 'verify', 'finish']);
  if (!valid.has(stage)) {
    throw new Error(`invalid stage: ${stage || '<empty>'}`);
  }
  return stage;
}

export function evidenceRootFor({ repo, evidenceCarrier, phaseExecutionDir }) {
  const carrier = String(evidenceCarrier || '').trim();
  if (carrier === 'phase') {
    if (!phaseExecutionDir) {
      throw new Error('--phase-execution-dir is required for phase evidence');
    }
    return path.resolve(repo, phaseExecutionDir, 'evidence', 'code-review-graph');
  }
  if (carrier === 'bounded') {
    return path.resolve(repo, '.claude', 'logs', 'code-review-graph', 'evidence');
  }
  throw new Error(`invalid evidence carrier: ${carrier || '<empty>'}`);
}

export function buildEvidenceBlock(record) {
  const lines = [
    EVIDENCE_BLOCK_BEGIN,
    'analysisContext:',
    '  codeReviewGraph:',
    `    graphStatus: ${record.graphStatus}`,
    `    stageCoverage: ${record.stage}`,
    `    evidenceCarrier: ${record.evidenceCarrier}`,
    `    adapterRunId: ${record.adapterRunId}`,
    `    adapterArtifact: ${record.artifactPath}`,
    `    adapterArtifactDigest: ${record.digest}`,
    `    updatedAt: ${record.updatedAt}`,
  ];
  if (record.failureClass) {
    lines.push(`    warning: ${record.failureClass}`);
  }
  lines.push(EVIDENCE_BLOCK_END, '');
  return `${lines.join('\n')}`;
}

export function replaceEvidenceBlock(currentText, blockText) {
  const text = String(currentText || '');
  const begin = text.indexOf(EVIDENCE_BLOCK_BEGIN);
  const end = text.indexOf(EVIDENCE_BLOCK_END);
  if (begin !== -1 && end !== -1 && end >= begin) {
    const afterEnd = end + EVIDENCE_BLOCK_END.length;
    const prefix = text.slice(0, begin).replace(/\s+$/u, '');
    const suffix = text.slice(afterEnd).replace(/^\s+/u, '');
    return [prefix, blockText.trimEnd(), suffix].filter(Boolean).join('\n\n') + '\n';
  }
  const prefix = text.trimEnd();
  return [prefix, blockText.trimEnd()].filter(Boolean).join('\n\n') + '\n';
}

export function readAnalysisEvidence(analysisFile) {
  if (!analysisFile || !fs.existsSync(analysisFile)) {
    return null;
  }
  const text = fs.readFileSync(analysisFile, 'utf8');
  const begin = text.indexOf(EVIDENCE_BLOCK_BEGIN);
  const end = text.indexOf(EVIDENCE_BLOCK_END);
  if (begin === -1 || end === -1 || end < begin) {
    return null;
  }
  const block = text.slice(begin, end);
  const evidence = {};
  for (const line of block.split(/\r?\n/u)) {
    const match = line.match(/^\s{4}([A-Za-z][A-Za-z0-9]*):\s*(.*)$/u);
    if (match) {
      evidence[match[1]] = match[2].trim();
    }
  }
  return evidence;
}
