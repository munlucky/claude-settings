#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import process from 'node:process';

const ITEM_PATTERNS = {
  requirement: /\bREQ-[A-Z0-9][A-Z0-9._-]*\b/g,
  scenario: /\bSCN-[A-Z0-9][A-Z0-9._-]*\b/g,
  uat: /\bUAT-[A-Z0-9][A-Z0-9._-]*\b/g,
};

const VALID_MODES = new Set([
  'tdd_red_green',
  'characterization_first',
  'evidence_mandatory',
  'not_applicable',
]);

const usage = () => `Usage: node scripts/spec-test-obligations.mjs validate --sprint-contract <file> --qa-report <file> --requirements-traceability <file> --scenario-matrix <file> --scorecard <file> [--source <file>] [--strict-seam] [--json]`;

const parseArgs = (argv) => {
  const [command = ''] = argv;
  const options = { command, json: false, sources: [], strictSeam: false };

  for (let index = 1; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--json') {
      options.json = true;
    } else if (arg === '--strict-seam') {
      options.strictSeam = true;
    } else if (arg === '--source') {
      options.sources.push(argv[++index] || '');
    } else if (arg.startsWith('--')) {
      const key = arg.slice(2).replace(/-([a-z])/g, (_, char) => char.toUpperCase());
      options[key] = argv[++index] || '';
    } else {
      throw new Error(`Unknown argument: ${arg}\n${usage()}`);
    }
  }

  return options;
};

const optionPathEntries = (options) => ([
  ['sprintContract', options.sprintContract],
  ['qaReport', options.qaReport],
  ['requirementsTraceability', options.requirementsTraceability],
  ['scenarioMatrix', options.scenarioMatrix],
  ['scorecard', options.scorecard],
  ...options.sources.map((source, index) => [`source${index + 1}`, source]),
]).filter(([, filePath]) => filePath);

const readDocuments = async (options) => {
  const entries = optionPathEntries(options);
  if (entries.length === 0) {
    throw Object.assign(new Error(`No input documents provided.\n${usage()}`), { exitCode: 2 });
  }

  const documents = [];
  for (const [role, filePath] of entries) {
    try {
      documents.push({
        role,
        path: filePath,
        text: await readFile(filePath, 'utf8'),
      });
    } catch (error) {
      throw Object.assign(new Error(`Unable to read ${role}: ${filePath}: ${error.message}`), { exitCode: 2 });
    }
  }
  return documents;
};

const normalizeScalar = (value) => {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) {
    return '';
  }
  const unquoted = trimmed.replace(/^['"]|['"]$/g, '');
  if (unquoted === 'true') return true;
  if (unquoted === 'false') return false;
  return unquoted;
};

const textRegionsForExtraction = (text) => {
  const regions = [];
  let current = [];
  let fenced = false;
  let includeFence = false;

  const flush = () => {
    if (current.length > 0) {
      regions.push(current.join('\n'));
      current = [];
    }
  };

  for (const line of text.split(/\r?\n/)) {
    const fenceMatch = /^```(.*)$/.exec(line.trim());
    if (fenceMatch) {
      if (!fenced) {
        flush();
        fenced = true;
        includeFence = /spec-obligations/i.test(fenceMatch[1]);
        if (includeFence) {
          current.push(line);
        }
      } else {
        if (includeFence) {
          current.push(line);
          flush();
        }
        fenced = false;
        includeFence = false;
      }
      continue;
    }

    if (!fenced || includeFence) {
      current.push(line);
    }
  }

  flush();
  return regions.join('\n');
};

const contextForMatch = (text, index) => {
  const start = Math.max(0, text.lastIndexOf('\n', index - 1) + 1);
  const end = text.indexOf('\n', index);
  return text.slice(start, end === -1 ? text.length : end);
};

const detectDepth = (context = '') => {
  const match = /(?:requiredDepth|Flow Depth|depth)\s*[:|]?\s*(broad_stack|ui_integration|e2e|integration|component|unit|smoke)/i.exec(context);
  if (match) {
    return match[1].toLowerCase();
  }
  const loose = /\b(broad_stack|ui_integration|e2e|open-act-mutate-persist-recover|integration|component|unit|smoke)\b/i.exec(context);
  return loose ? loose[1].toLowerCase() : '';
};

const detectInterface = (context = '') => {
  const match = /\b(browser|ui|api|cli|code)\b/i.exec(context);
  return match ? match[1].toLowerCase() : '';
};

const detectEnvironment = (context = '') => {
  const match = /\b(hermetic|local|docker|preview|staging|canary)\b/i.exec(context);
  return match ? match[1].toLowerCase() : '';
};

const isCriticalContext = (context = '', role = '') => {
  if (/UAT_CHECKLIST/i.test(role) && /critical\s*[:|]?\s*yes/i.test(context)) {
    return true;
  }
  return /UAT-critical|uatCritical:\s*true|critical\s*[:|]?\s*(yes|true)|\|\s*yes\s*\|/i.test(context);
};

const extractItems = (documents) => {
  const byId = new Map();

  for (const document of documents) {
    const visible = textRegionsForExtraction(document.text);
    for (const [itemType, pattern] of Object.entries(ITEM_PATTERNS)) {
      pattern.lastIndex = 0;
      for (const match of visible.matchAll(pattern)) {
        const id = match[0];
        const context = contextForMatch(visible, match.index || 0);
        const uatCritical = itemType === 'uat' && isCriticalContext(context, document.role);
        if (itemType === 'uat' && !uatCritical) {
          continue;
        }
        const existing = byId.get(id);
        const next = {
          id,
          itemType,
          sourcePath: existing?.sourcePath || document.path,
          sourceSection: context.trim(),
          criticality: itemType === 'scenario' && isCriticalContext(context, document.role) ? 'critical' : (existing?.criticality || ''),
          uatCritical: existing?.uatCritical || uatCritical,
          behaviorChanging: !/\bnon[-_ ]?behavioral|behaviorChanging:\s*false/i.test(context),
          requiredInterface: existing?.requiredInterface || detectInterface(context),
          requiredDepth: existing?.requiredDepth || detectDepth(context),
          requiredEnvironment: existing?.requiredEnvironment || detectEnvironment(context),
        };
        byId.set(id, next);
      }
    }
  }

  return [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
};

const parseObligationsFromText = (text, sourcePath) => {
  const obligations = [];
  const lines = text.split(/\r?\n/);
  let active = false;
  let current = null;

  const finish = () => {
    if (current?.id) {
      obligations.push({ ...current, sourcePath });
    }
    current = null;
  };

  for (const rawLine of lines) {
    const line = rawLine.replace(/\t/g, '  ');
    if (/^\s*specTestObligations\s*:\s*$/.test(line)) {
      active = true;
      finish();
      continue;
    }
    if (!active) {
      continue;
    }
    if (/^```/.test(line.trim())) {
      finish();
      active = false;
      continue;
    }
    const itemMatch = /^\s*-\s+id\s*:\s*(.*)$/.exec(line);
    if (itemMatch) {
      finish();
      current = { id: String(normalizeScalar(itemMatch[1])) };
      continue;
    }
    const keyValueMatch = /^\s+([A-Za-z][A-Za-z0-9]*)\s*:\s*(.*)$/.exec(line);
    if (keyValueMatch && current) {
      current[keyValueMatch[1]] = normalizeScalar(keyValueMatch[2]);
    }
  }

  finish();
  return obligations;
};

const extractObligations = (documents) => documents
  .flatMap((document) => parseObligationsFromText(textRegionsForExtraction(document.text), document.path))
  .sort((a, b) => String(a.id).localeCompare(String(b.id)));

const truthy = (value) => value === true || /^(true|yes|1|pass|passed)$/i.test(String(value || '').trim());
const present = (value) => String(value ?? '').trim() !== '';
const normalized = (value) => String(value || '').trim().toLowerCase();

const finding = (classification, id, message, sourcePath = '') => ({
  class: classification,
  id,
  severity: 'blocking',
  message,
  sourcePath,
});

const validateObligation = (obligation, item, options = {}) => {
  const findings = [];
  const mode = normalized(obligation.verificationMode);
  const behaviorChanging = truthy(obligation.behaviorChanging) || item?.behaviorChanging === true;

  if (behaviorChanging && !mode) {
    findings.push(finding('behavior_changing_default_missing', obligation.id, 'behavior-changing item requires an explicit verificationMode', obligation.sourcePath));
  }
  if (mode && !VALID_MODES.has(mode)) {
    findings.push(finding('invalid_spec_test_bypass', obligation.id, `unsupported verificationMode: ${mode}`, obligation.sourcePath));
  }
  if (options.strictSeam && behaviorChanging && !present(obligation.highestPublicSeam || obligation.seamRationale)) {
    findings.push(finding('seam_rationale_missing', obligation.id, 'behavior-changing obligation requires highestPublicSeam or seamRationale in strict seam mode', obligation.sourcePath));
  }
  if (normalized(obligation.interface) === 'code' && ['ui_integration', 'e2e'].includes(normalized(obligation.depth))) {
    findings.push(finding('invalid_depth_interface_combo', obligation.id, 'code interface cannot satisfy UI/E2E depth directly', obligation.sourcePath));
  }

  if (mode === 'tdd_red_green') {
    if (!present(obligation.redCommand) || !present(obligation.redEvidencePath || obligation.redEvidence)) {
      findings.push(finding('tdd_red_evidence_missing', obligation.id, 'tdd_red_green requires red command and red evidence path', obligation.sourcePath));
    }
    if (!present(obligation.greenCommand) || !present(obligation.greenEvidencePath || obligation.greenEvidence)) {
      findings.push(finding('tdd_green_evidence_missing', obligation.id, 'tdd_red_green requires green command and green evidence path', obligation.sourcePath));
    }
  }

  if (mode === 'characterization_first' && (!present(obligation.characterizationCommand) || !present(obligation.evidencePath))) {
    findings.push(finding('characterization_pin_missing', obligation.id, 'characterization_first requires current-behavior pinning command and evidencePath', obligation.sourcePath));
  }

  if (mode === 'evidence_mandatory' && (!present(obligation.requiredCommand) || !present(obligation.evidencePath) || !present(obligation.bypassReason))) {
    findings.push(finding('invalid_spec_test_bypass', obligation.id, 'evidence_mandatory requires requiredCommand, evidencePath, and bypassReason', obligation.sourcePath));
  }

  if (mode === 'not_applicable' && (behaviorChanging || !present(obligation.bypassReason))) {
    findings.push(finding('invalid_spec_test_bypass', obligation.id, 'not_applicable is allowed only for non-behavioral items with bypassReason', obligation.sourcePath));
  }

  const status = normalized(obligation.status);
  if (!['pass', 'passed', 'not_applicable'].includes(status)) {
    findings.push(finding('required_spec_test_not_run', obligation.id, 'obligation status must be pass, passed, or approved not_applicable', obligation.sourcePath));
  }

  const itemRequiresDeepScenario = item?.itemType === 'scenario'
    && item?.criticality === 'critical';
  const obligationSmokeOnly = ['smoke', 'smoke_only'].includes(normalized(obligation.depth || obligation.evidenceDepth))
    || /smoke-only/i.test(String(obligation.evidencePath || obligation.bypassReason || obligation.requiredCommand || ''));
  if (itemRequiresDeepScenario && obligationSmokeOnly) {
    findings.push(finding('critical_scenario_smoke_only', obligation.id, 'critical scenario requires deeper evidence than smoke-only', obligation.sourcePath));
  }

  return findings;
};

export function validateSpecTestObligations({ documents = [], strictSeam = false } = {}) {
  const items = extractItems(documents);
  const obligations = extractObligations(documents);
  const obligationById = new Map(obligations.map((obligation) => [obligation.id, obligation]));
  const obligationCounts = new Map();
  const findings = [];

  for (const obligation of obligations) {
    obligationCounts.set(obligation.id, (obligationCounts.get(obligation.id) || 0) + 1);
  }

  for (const [id, count] of obligationCounts.entries()) {
    if (count > 1) {
      const duplicate = obligations.find((obligation) => obligation.id === id);
      findings.push(finding(
        'duplicate_spec_test_obligation',
        id,
        `${id} has ${count} specTestObligations rows; ids must be unique`,
        duplicate?.sourcePath || '',
      ));
    }
  }

  for (const item of items) {
    if (!obligationById.has(item.id)) {
      findings.push(finding(
        item.itemType === 'uat' ? 'uat_critical_obligation_missing' : 'spec_test_obligation_missing',
        item.id,
        `${item.id} has no specTestObligations row`,
        item.sourcePath,
      ));
    }
  }

  for (const obligation of obligations) {
    findings.push(...validateObligation(obligation, items.find((item) => item.id === obligation.id), { strictSeam }));
  }

  return {
    schemaVersion: 1,
    status: findings.length === 0 ? 'pass' : 'fail',
    summary: {
      requiredItemCount: items.length,
      obligationCount: obligations.length,
      findingCount: findings.length,
    },
    items,
    obligations,
    findings,
  };
}

const writeResult = (result, json) => {
  if (json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(result.status);
  }
};

const main = async () => {
  const options = parseArgs(process.argv.slice(2));
  if (options.command === '--help' || options.command === '-h') {
    console.log(usage());
    return;
  }
  if (options.command !== 'validate') {
    throw Object.assign(new Error(`Unknown command: ${options.command}\n${usage()}`), { exitCode: 2 });
  }

  const documents = await readDocuments(options);
  const result = validateSpecTestObligations({ documents, strictSeam: options.strictSeam });
  writeResult(result, options.json);
  if (result.status === 'fail') {
    process.exitCode = 1;
  }
};

if (import.meta.url === `file://${process.argv[1].replaceAll('\\', '/')}` || process.argv[1]?.endsWith('spec-test-obligations.mjs')) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = error.exitCode || 2;
  });
}
