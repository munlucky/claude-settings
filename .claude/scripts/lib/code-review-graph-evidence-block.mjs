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

export function extractEvidenceBlockText(text) {
  const source = String(text || '');
  const begin = source.indexOf(EVIDENCE_BLOCK_BEGIN);
  const end = source.indexOf(EVIDENCE_BLOCK_END);
  if (begin === -1 && end === -1) {
    return { blockText: '', error: '', count: 0 };
  }
  if (begin === -1 || end === -1 || end < begin) {
    return { blockText: '', error: 'malformed_code_review_graph_evidence_block', count: 0 };
  }
  const afterEnd = end + EVIDENCE_BLOCK_END.length;
  const duplicateBegin = source.indexOf(EVIDENCE_BLOCK_BEGIN, afterEnd);
  const duplicateEnd = source.indexOf(EVIDENCE_BLOCK_END, afterEnd);
  if (duplicateBegin !== -1 || duplicateEnd !== -1) {
    return { blockText: '', error: 'duplicate_code_review_graph_evidence_block', count: 2 };
  }
  return { blockText: source.slice(begin, afterEnd), error: '', count: 1 };
}

function parseJsonEvidenceBlock(block) {
  const fenced = block.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = fenced ? fenced[1] : block
    .replace(EVIDENCE_BLOCK_BEGIN, '')
    .replace(EVIDENCE_BLOCK_END, '')
    .trim();
  if (!raw.startsWith('{')) {
    return null;
  }
  return JSON.parse(raw);
}

export function readAnalysisEvidenceFromText(text) {
  const { blockText, error, count } = extractEvidenceBlockText(text);
  if (error) {
    return { __error: error, __count: count };
  }
  if (!blockText) {
    return null;
  }
  try {
    const parsed = parseJsonEvidenceBlock(blockText);
    if (parsed) {
      return { ...parsed, __count: count };
    }
  } catch {
    return { __error: 'malformed_code_review_graph_evidence_json', __count: count };
  }

  const block = blockText.slice(0, blockText.indexOf(EVIDENCE_BLOCK_END));
  const evidence = { __count: count };
  for (const line of block.split(/\r?\n/u)) {
    const match = line.match(/^\s{4}([A-Za-z][A-Za-z0-9]*):\s*(.*)$/u);
    if (match) {
      evidence[match[1]] = match[2].trim();
    }
  }
  return evidence;
}

export function readAnalysisEvidence(analysisFile) {
  if (!analysisFile || !fs.existsSync(analysisFile)) {
    return null;
  }
  return readAnalysisEvidenceFromText(fs.readFileSync(analysisFile, 'utf8'));
}
