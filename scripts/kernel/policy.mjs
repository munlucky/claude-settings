import path from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const sourceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const readPolicy = (name) => readFileSync(path.join(sourceRoot, 'kernel', name), 'utf8');
const parseMap = (text, section) => {
  const start = text.indexOf(`${section}:`);
  if (start < 0) return {};
  const result = {};
  for (const line of text.slice(start).split(/\r?\n/).slice(1)) {
    if (/^\S/.test(line) && line.trim()) break;
    const match = line.match(/^\s{2}([A-Za-z0-9_-]+):\s*(.+)$/);
    if (match) result[match[1]] = match[2].trim();
  }
  return result;
};
const parseListMap = (text, section) => {
  const map = parseMap(text, section);
  return Object.fromEntries(Object.entries(map).map(([key, value]) => [key, value.replace(/^\[|\]$/g, '').split(',').map((item) => item.trim()).filter(Boolean)]));
};

const proofPolicy = readPolicy('proof-policy.yaml');
const evidencePolicy = readPolicy('evidence-policy.yaml');
const toSurface = (key) => key.replace(/[A-Z]/g, (char) => `_${char.toLowerCase()}`);

export const KERNEL_POLICY = Object.freeze({
  proofTiers: parseMap(proofPolicy, 'tiers'),
  hardFloors: Object.fromEntries(Object.entries(parseMap(proofPolicy, 'hardFloors')).map(([key, value]) => [toSurface(key), value])),
  requiredChecks: parseListMap(proofPolicy, 'requiredChecks'),
  proofToEvidence: parseMap(evidencePolicy, 'proofToEvidence'),
  context: {
    stableTokenBudget: Number(parseMap(readPolicy('context-policy.yaml'), 'budgets').stable || 600),
    stageTokenBudget: Number(parseMap(readPolicy('context-policy.yaml'), 'budgets').stage || 1800),
  },
});
