import { createHash } from 'node:crypto';
import { makeContextReceipt } from './context-receipt.mjs';

const secretKeyRegex = /^(?:api[_-]?key|token|password|secret|authorization|access[_-]?token|auth[_-]?token|private[_-]?key)$/i;

const stringSecretPatterns = [
  { regex: /(?:Authorization\s*:\s*)?Bearer\s+\S+/gi, replace: 'Authorization: Bearer [REDACTED]' },
  { regex: /-----BEGIN (?:[A-Z0-9\s]+ )?PRIVATE KEY-----[\s\S]*?-----END (?:[A-Z0-9\s]+ )?PRIVATE KEY-----/g, replace: '[REDACTED_PEM_KEY]' },
  { regex: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, replace: '[REDACTED_JWT]' },
  { regex: /\b([a-z0-9+.-]+:\/\/[^:\s]+:)([^@\s]+)(@[^\s]+)/gi, replace: '$1[REDACTED]$3' },
  { regex: /("(?:api[_-]?key|token|password|secret|access[_-]?token|auth[_-]?token|private[_-]?key)"\s*:\s*)("(?:[^"\\]|\\.)*"|\S+)/gi, replace: '$1"[REDACTED]"' },
  { regex: /((?:api[_-]?key|token|password|secret|access[_-]?token|auth[_-]?token|private[_-]?key)\s*[:=]\s*)("[^"]*"|'[^']*'|\S+)/gi, replace: '$1[REDACTED]' },
];

export const redactSecretsInObject = (val) => {
  if (val === null || typeof val !== 'object') return val;
  if (Array.isArray(val)) return val.map(redactSecretsInObject);
  const result = {};
  for (const [key, v] of Object.entries(val)) {
    if (secretKeyRegex.test(key)) {
      result[key] = '[REDACTED]';
    } else {
      result[key] = redactSecretsInObject(v);
    }
  }
  return result;
};

export const sanitizeText = (text) => {
  let str = String(text || '');
  for (const pattern of stringSecretPatterns) {
    str = str.replace(pattern.regex, pattern.replace);
  }
  return str;
};

const forbiddenType = new Set(['raw-runtime-log', 'transcript', 'full-knowledge-graph-dump']);
const estimateTokens = (text) => Math.ceil(String(text).length / 4);

export const buildKernelContext = ({ stage, principles = [], taskContract, stageRecords = [], references = [], evidence = [], policyRevision = '1' }) => {
  const included = [];
  const omitted = [];

  const accept = (record, layer) => {
    if (forbiddenType.has(record.type)) {
      omitted.push({ id: record.id, reason: 'forbidden-type' });
      return null;
    }
    const content = sanitizeText(record.content);
    const contentDigest = createHash('sha256').update(content).digest('hex');
    included.push({ id: record.id, layer, revision: record.revision || 'unknown', contentDigest });
    return content;
  };

  const blocks = [];
  if (principles.length) {
    const sanitizedPrinciples = principles.map((p) => `- ${sanitizeText(p)}`).join('\n');
    blocks.push(`## Stable Principles\n${sanitizedPrinciples}`);
  }

  if (taskContract) {
    const redactedContract = redactSecretsInObject(taskContract);
    const contractJson = sanitizeText(JSON.stringify(redactedContract, null, 2));
    blocks.push(`## Task Contract\n${contractJson}`);
  }

  const stageContent = stageRecords.map((r) => accept(r, 'stage-context')).filter(Boolean);
  if (stageContent.length) blocks.push(`## Stage Context\n${stageContent.join('\n\n')}`);

  const refs = references.map((r) => accept(r, 'on-demand-reference')).filter(Boolean);
  if (refs.length) blocks.push(`## On-demand References\n${refs.join('\n')}`);

  const ev = evidence.map((r) => accept(r, 'evidence-digest')).filter(Boolean);
  if (ev.length) blocks.push(`## Evidence Digest\n${ev.join('\n')}`);

  const promptBlock = blocks.join('\n\n');
  return {
    promptBlock,
    receipt: makeContextReceipt({ stage, policyRevision, included, omitted, tokenEstimate: estimateTokens(promptBlock) }),
  };
};
