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

export const wrapUntrustedDataFence = (content, label = 'untrusted_content') => {
  const sanitized = sanitizeText(content);
  return `<${label}>\n${sanitized}\n</${label}>`;
};

const forbiddenType = new Set(['raw-runtime-log', 'transcript', 'full-knowledge-graph-dump']);
const estimateTokens = (text) => Math.ceil(String(text).length / 4);

export const MAX_PROMPT_TOKENS = 600;
export const MAX_CONTEXT_TOKENS = 1800;

export const buildKernelContext = ({ stage, principles = [], taskContract, stageRecords = [], references = [], evidence = [], policyRevision = '1' }) => {
  const included = [];
  const omitted = [];

  const accept = (record, layer) => {
    if (forbiddenType.has(record.type)) {
      omitted.push({ id: record.id, reason: 'forbidden-type' });
      return null;
    }
    const content = wrapUntrustedDataFence(record.content, `untrusted_${layer.replaceAll('-', '_')}`);
    const contentDigest = createHash('sha256').update(content).digest('hex');
    included.push({ id: record.id, layer, revision: record.revision || 'unknown', contentDigest });
    return content;
  };

  const blocks = [];
  const addBlock = (text, entries = []) => {
    const maxChars = MAX_PROMPT_TOKENS * 4;
    if (estimateTokens(text) <= MAX_PROMPT_TOKENS) {
      blocks.push({ text, entries });
      return;
    }
    const truncatedEntries = entries.map((entry) => ({ ...entry, truncated: true }));
    blocks.push({ text: `${text.slice(0, maxChars - 24)}\n[TRUNCATED]`, entries: truncatedEntries });
  };
  if (principles.length) {
    const sanitizedPrinciples = principles.map((p) => `- ${sanitizeText(p)}`).join('\n');
    const principlesDigest = createHash('sha256').update(sanitizedPrinciples).digest('hex');
    addBlock(`## Stable Principles\n${sanitizedPrinciples}`, [{ id: 'stable-principles', layer: 'stable-principles', revision: policyRevision, contentDigest: principlesDigest }]);
  }

  if (taskContract) {
    const redactedContract = redactSecretsInObject(taskContract);
    const contractJson = sanitizeText(JSON.stringify(redactedContract, null, 2));
    const contractDigest = createHash('sha256').update(contractJson).digest('hex');
    addBlock(`## Task Contract\n${contractJson}`, [{ id: 'task-contract', layer: 'task-contract', revision: policyRevision, contentDigest: contractDigest }]);
  }

  const stageEntries = [];
  const stageContent = stageRecords.map((r) => {
    const before = included.length;
    const content = accept(r, 'stage-context');
    if (content) stageEntries.push(included[before]);
    return content;
  }).filter(Boolean);
  if (stageContent.length) addBlock(`## Stage Context\n${stageContent.join('\n\n')}`, stageEntries);

  const referenceEntries = [];
  const refs = references.map((r) => {
    const before = included.length;
    const content = accept(r, 'on-demand-reference');
    if (content) referenceEntries.push(included[before]);
    return content;
  }).filter(Boolean);
  if (refs.length) addBlock(`## On-demand References\n${refs.join('\n')}`, referenceEntries);

  const evidenceEntries = [];
  const ev = evidence.map((r) => {
    const before = included.length;
    const content = accept(r, 'evidence-digest');
    if (content) evidenceEntries.push(included[before]);
    return content;
  }).filter(Boolean);
  if (ev.length) addBlock(`## Evidence Digest\n${ev.join('\n')}`, evidenceEntries);

  let promptBlock = blocks.map((block) => block.text).join('\n\n');
  let currentTokens = estimateTokens(promptBlock);

  // Deterministic Truncation Enforcement (KRN-AUD-P1-01)
  if (currentTokens > MAX_CONTEXT_TOKENS) {
    while (blocks.length > 2 && currentTokens > MAX_CONTEXT_TOKENS) {
      const removedBlock = blocks.pop();
      omitted.push(...removedBlock.entries.map((entry) => ({ id: entry.id, reason: 'context-budget' })));
      promptBlock = blocks.map((block) => block.text).join('\n\n');
      currentTokens = estimateTokens(promptBlock);
    }
  }

  // Even the two authoritative blocks must honor the declared prompt budget.
  if (currentTokens > MAX_CONTEXT_TOKENS) {
    const maxChars = MAX_CONTEXT_TOKENS * 4;
    promptBlock = `${promptBlock.slice(0, Math.max(0, maxChars - 24))}\n[TRUNCATED]`;
    currentTokens = estimateTokens(promptBlock);
  }

  const retainedIds = new Set(blocks.flatMap((block) => block.entries.map((entry) => entry.id)));
  const retainedEntries = blocks.flatMap((block) => block.entries);
  const seenIds = new Set();
  included.splice(0, included.length, ...retainedEntries.filter((entry) => {
    if (!retainedIds.has(entry.id) || seenIds.has(entry.id)) return false;
    seenIds.add(entry.id);
    return true;
  }));

  return {
    promptBlock,
    receipt: makeContextReceipt({ stage, policyRevision, included, omitted, tokenEstimate: currentTokens }),
  };
};

export const buildContextReceipt = async (options) => {
  const result = buildKernelContext(options);
  return { ...result, ...result.receipt };
};
