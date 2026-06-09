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

const usage = () => `Usage: node scripts/architecture-feedback-render.mjs [--contract-slice <file>] [--handoff <file>] --violation-json <json> [--json]`;

const parseArgs = (argv) => {
  const options = { contractSlice: '', handoff: '', violationJson: '', json: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--contract-slice') options.contractSlice = argv[++index] || '';
    else if (arg === '--handoff') options.handoff = argv[++index] || '';
    else if (arg === '--violation-json') options.violationJson = argv[++index] || '';
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

const toArray = (value) => Array.isArray(value) ? value : value ? [value] : [];

const unique = (items) => [...new Set(items.filter(Boolean))];

export const renderArchitectureFeedback = ({ contract = null, handoff = null, violation = {}, refs = {} }) => {
  const errors = [];
  if (hasRawField(violation) || hasRawField(contract) || hasRawField(handoff)) {
    errors.push({ code: 'unsafe_raw_payload', message: 'feedback input contains unsafe raw payload and was not copied', severity: 'blocking' });
  }

  const violatedIds = toArray(violation.violated || violation.constraintId || violation.id);
  const constraints = contract?.constraints || [];
  const matchedConstraints = violatedIds
    .map((id) => constraints.find((constraint) => constraint.id === id) || { id, severity: violation.severity || 'blocking', summary: violation.summary || `Violation: ${id}` });

  const readBeforeRetry = unique([
    ...toArray(handoff?.readBeforeRetry),
    ...matchedConstraints.map((constraint) => constraint.sourceRef),
    ...toArray(violation.readBeforeRetry),
  ]);
  const verificationSignals = unique([
    ...(contract?.verificationSignals || []).map((signal) => signal.commandOrEvidence),
    ...toArray(violation.verificationSignals),
  ]).map((commandOrEvidence, index) => ({
    id: `verification-${index + 1}`,
    commandOrEvidence,
  }));
  const sourceRefs = unique([
    violation.sourceRef,
    ...toArray(violation.evidenceRefs),
  ]);

  const feedback = {
    schemaVersion: 1,
    artifactId: 'ARCHITECTURE_FEEDBACK',
    owner: 'moonshot-architecture',
    status: errors.length ? 'blocked' : 'ready',
    sourceContractRef: refs.contractSlice || '',
    sourceHandoffRef: refs.handoff || '',
    violated: matchedConstraints.map((constraint) => ({
      id: constraint.id,
      severity: constraint.severity || 'blocking',
      summary: constraint.summary || `Violation: ${constraint.id}`,
    })),
    evidence: sourceRefs.map((sourceRef) => ({
      sourceRef,
      summary: violation.summary || 'Architecture contract violation evidence',
    })),
    readBeforeRetry,
    requiredActions: toArray(violation.requiredActions).length
      ? toArray(violation.requiredActions)
      : ['Restore the implementation to satisfy the architecture contract before retrying.'],
    verificationSignals,
    warnings: [],
    errors,
  };

  return feedback;
};

export const renderTextFeedback = (feedback) => [
  'ARCHITECTURE_CONTRACT_FAILED',
  '',
  'Violated:',
  ...(feedback.violated.length ? feedback.violated.map((item) => `- ${item.id} [${item.severity}]: ${item.summary}`) : ['- unknown']),
  '',
  'Evidence:',
  ...(feedback.evidence.length ? feedback.evidence.map((item) => `- ${item.sourceRef}: ${item.summary}`) : ['- no external evidence ref provided']),
  '',
  'Read before retry:',
  ...(feedback.readBeforeRetry.length ? feedback.readBeforeRetry.map((item) => `- ${item}`) : ['- ARCHITECTURE_HANDOFF.json']),
  '',
  'Required action:',
  ...feedback.requiredActions.map((item) => `- ${item}`),
  '',
  'Verification:',
  ...(feedback.verificationSignals.length ? feedback.verificationSignals.map((item) => `- ${item.commandOrEvidence}`) : ['- rerun the phase verification signal']),
].join('\n');

const readJsonFile = async (filePath) => {
  if (!filePath) return null;
  return JSON.parse(await readFile(path.resolve(filePath), 'utf8'));
};

const main = async () => {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }
  if (!args.violationJson) throw new Error(`Missing --violation-json\n${usage()}`);
  const violation = JSON.parse(args.violationJson);
  const feedback = renderArchitectureFeedback({
    contract: await readJsonFile(args.contractSlice),
    handoff: await readJsonFile(args.handoff),
    violation,
    refs: {
      contractSlice: args.contractSlice,
      handoff: args.handoff,
    },
  });
  if (args.json) console.log(JSON.stringify({ ...feedback, text: renderTextFeedback(feedback) }, null, 2));
  else console.log(renderTextFeedback(feedback));
};

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
