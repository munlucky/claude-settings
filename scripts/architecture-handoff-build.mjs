#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const RAW_FIELD_NAMES = new Set([
  'rawGraph',
  'rawOntology',
  'rawMemoryGraph',
  'transcriptBody',
  'runtimeLogBody',
  'browserScrapeBody',
  'secret',
]);

const usage = () => `Usage: node scripts/architecture-handoff-build.mjs --contract-slice <file> [--json]`;

const parseArgs = (argv) => {
  const options = { contractSlice: '', json: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--contract-slice') options.contractSlice = argv[++index] || '';
    else if (arg === '--json') options.json = true;
    else if (arg === '--help' || arg === '-h') options.help = true;
    else throw new Error(`Unknown argument: ${arg}\n${usage()}`);
  }
  return options;
};

const hasRawField = (value, seen = new Set()) => {
  if (!value || typeof value !== 'object') return false;
  if (seen.has(value)) return false;
  seen.add(value);
  if (Array.isArray(value)) return value.some((item) => hasRawField(item, seen));
  for (const [key, nested] of Object.entries(value)) {
    if (RAW_FIELD_NAMES.has(key)) return true;
    if (hasRawField(nested, seen)) return true;
  }
  return false;
};

const lineList = (items, formatter) => {
  if (!items?.length) return ['  - none'];
  return items.map(formatter);
};

const compactPrompt = (contract, sourceContractRef) => [
  '## Architecture Handoff Context',
  `- sourceContract: ${sourceContractRef || contract.sourceKnowledgeSliceRef || 'ARCHITECTURE_CONTRACT_SLICE.json'}`,
  `- target: ${contract.handoffRecommendation?.target || 'none'}`,
  `- status: ${contract.status}`,
  '',
  '- selected decisions:',
  ...lineList(contract.decisions, (decision) => `  - ${decision.id}: ${decision.summary}`),
  '',
  '- selected constraints:',
  ...lineList(contract.constraints, (constraint) => `  - ${constraint.id} [${constraint.severity}] enforced_by: ${(constraint.enforcedBy || []).join(', ') || 'none'}`),
  '',
  '- owned paths:',
  ...lineList(contract.pathBoundaries?.ownedPaths, (item) => `  - ${item}`),
  '',
  '- read-only paths:',
  ...lineList(contract.pathBoundaries?.readOnlyPaths, (item) => `  - ${item}`),
  '',
  '- verification signals:',
  ...lineList(contract.verificationSignals, (signal) => `  - ${signal.id}: ${signal.commandOrEvidence}`),
].join('\n');

export const buildArchitectureHandoff = (contract, options = {}) => {
  const errors = [...(contract.errors || [])];
  if (hasRawField(contract)) {
    errors.push({ code: 'unsafe_raw_payload', message: 'contract contains unsafe raw payload', severity: 'blocking' });
  }
  const blocking = contract.status === 'blocked' || contract.status === 'failed' || contract.handoffRecommendation?.blocking || errors.length > 0;
  const handoffTarget = blocking ? 'none' : contract.handoffRecommendation?.target || 'moonshot-orchestrator';
  const selectedDecisionIds = (contract.decisions || []).map((item) => item.id);
  const selectedConstraintIds = (contract.constraints || []).map((item) => item.id);
  const verificationSignalIds = (contract.verificationSignals || []).map((item) => item.id);
  const readBeforeRetry = [
    ...(contract.decisions || []).map((item) => item.sourceRef).filter(Boolean),
    ...(contract.constraints || []).map((item) => item.sourceRef).filter(Boolean),
  ].filter((item, index, array) => array.indexOf(item) === index);

  return {
    schemaVersion: 1,
    artifactId: 'ARCHITECTURE_HANDOFF',
    owner: 'moonshot-architecture',
    sourceContractRef: options.sourceContractRef || '',
    handoffTarget,
    status: blocking ? 'blocked' : contract.status === 'degraded' ? 'degraded' : 'ready',
    blocking: Boolean(blocking),
    promptBlock: compactPrompt({ ...contract, errors }, options.sourceContractRef),
    metadata: {
      selectedDecisionIds,
      selectedConstraintIds,
      verificationSignalIds,
      ownedPaths: contract.pathBoundaries?.ownedPaths || [],
      readOnlyPaths: contract.pathBoundaries?.readOnlyPaths || [],
    },
    readBeforeRetry,
    warnings: contract.warnings || [],
    errors,
  };
};

const main = async () => {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }
  if (!args.contractSlice) throw new Error(`Missing --contract-slice\n${usage()}`);
  const contractPath = path.resolve(args.contractSlice);
  const contract = JSON.parse(await readFile(contractPath, 'utf8'));
  const result = buildArchitectureHandoff(contract, { sourceContractRef: args.contractSlice });
  if (args.json) console.log(JSON.stringify(result, null, 2));
  else console.log(result.status);
  if (result.status === 'failed') process.exitCode = 1;
};

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
