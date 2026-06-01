#!/usr/bin/env node

import fs from 'node:fs';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const DEFAULT_WAVE_CAP = Number.parseInt(process.env.PHASE_PARALLEL_WAVE_CAP ?? '3', 10) || 3;
const BLOCKED_STATUSES = new Set(['verification_blocked', 'runtime_unhealthy', 'blocked']);
const ACTIVE_STATUSES = new Set(['in_progress']);
const RETRYABLE_STATUSES = new Set(['pending', 'pending_reverify']);
const SHARED_MUTABLE_PATHS = new Set([
  'package.json',
  'package-lock.json',
  'pnpm-lock.yaml',
  'yarn.lock',
  'bun.lockb',
  'Cargo.toml',
  'Cargo.lock',
  'pyproject.toml',
  'poetry.lock',
  '.claude/verification.contract.yaml',
  '.claude/docs/phase-status.yaml',
]);

function normalizePath(value) {
  return String(value || '').replaceAll('\\', '/').replace(/^\.\//, '').replace(/\/+$/, '');
}

function readText(filePath) {
  return filePath && fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '';
}

function writeStdoutLine(value = '') {
  process.stdout.write(`${String(value)}\n`);
}

function listPhaseDocs(planDir) {
  if (!planDir || !fs.existsSync(planDir)) {
    return [];
  }
  return fs.readdirSync(planDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
    .map((entry) => entry.name)
    .filter((name) => !name.includes('master') && !name.includes('00-'))
    .sort((a, b) => a.localeCompare(b));
}

function getPhaseDoc(planDir, phaseNum) {
  const phasePrefix = String(phaseNum).padStart(2, '0');
  const match = listPhaseDocs(planDir).find((name) => (
    name.startsWith(`${phasePrefix}-`)
    || name.includes(`phase${phaseNum}`)
    || name.includes(`phase-${phaseNum}`)
  ));
  return match ? normalizePath(path.join(planDir, match)) : '';
}

function getPhaseTitle(phaseDoc, phaseNum) {
  const lines = readText(phaseDoc).split(/\r?\n/).slice(0, 8);
  const heading = lines.find((line) => /^#/.test(line.trim()));
  return heading ? heading.replace(/^#+\s*/, '').replace(/\r/g, '') : `Phase ${phaseNum}`;
}

function readStatusBlocks(statusFile) {
  if (!statusFile || !fs.existsSync(statusFile)) {
    return [];
  }
  const lines = fs.readFileSync(statusFile, 'utf8').split(/\r?\n/);
  const blocks = [];
  let current = null;
  let currentIndent = 0;
  let inAttempts = false;

  for (const rawLine of lines) {
    if (/^\s*-\s+number:\s*/.test(rawLine)) {
      if (current) blocks.push(current);
      const match = rawLine.match(/number:\s*([0-9]+)/);
      current = {
        number: match ? match[1] : '',
        status: '',
        planConfirmed: '',
        lastOutcome: '',
        title: '',
      };
      currentIndent = rawLine.length - rawLine.trimStart().length;
      inAttempts = false;
      continue;
    }
    if (!current) continue;

    const indent = rawLine.length - rawLine.trimStart().length;
    const stripped = rawLine.trim();
    if (!stripped) continue;
    if (inAttempts && indent <= currentIndent + 2) {
      inAttempts = false;
    }
    if (stripped.startsWith('title:')) {
      current.title = stripped.slice('title:'.length).trim().replace(/^"|"$/g, '');
    } else if (stripped.startsWith('status:')) {
      current.status = stripped.slice('status:'.length).trim();
    } else if (stripped.startsWith('planConfirmed:')) {
      current.planConfirmed = stripped.slice('planConfirmed:'.length).trim().toLowerCase();
    } else if (stripped.startsWith('attempts:') && indent > currentIndent) {
      inAttempts = true;
    } else if (inAttempts && stripped.startsWith('lastOutcome:')) {
      current.lastOutcome = stripped.slice('lastOutcome:'.length).trim();
    }
  }
  if (current) blocks.push(current);
  return blocks;
}

function extractSection(text, headingPattern) {
  const lines = String(text || '').split(/\r?\n/);
  let start = -1;
  let level = 0;
  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(/^(#{1,6})\s+(.+?)\s*$/);
    if (match && headingPattern.test(match[2].trim())) {
      start = index + 1;
      level = match[1].length;
      break;
    }
  }
  if (start < 0) {
    return '';
  }
  let end = lines.length;
  for (let index = start; index < lines.length; index += 1) {
    const match = lines[index].match(/^(#{1,6})\s+/);
    if (match && match[1].length <= level) {
      end = index;
      break;
    }
  }
  return lines.slice(start, end).join('\n');
}

function extractTargetPaths(text) {
  const targetText = [
    extractSection(text, /^(exact execution targets|target files|in scope paths|implementation targets)$/i),
    String(text || '').split(/\r?\n/)
      .filter((line) => /^\s*(targetFiles|target files|target paths|ownedPaths|path):/i.test(line.trim()))
      .join('\n'),
  ].join('\n');
  const candidates = new Set();
  const pathTokenPattern = /`([^`]+)`|"([^"]+)"|'([^']+)'|(?:^|\s)([A-Za-z0-9_.@/-]+\.[A-Za-z0-9]+|[A-Za-z0-9_.@/-]+\/[A-Za-z0-9_.@/*-]*)/gm;
  let match;
  while ((match = pathTokenPattern.exec(targetText)) !== null) {
    const raw = match[1] || match[2] || match[3] || match[4] || '';
    const normalized = normalizePath(raw.replace(/^[-*]\s*/, '').replace(/[),.;:]+$/, ''));
    if (!normalized || normalized.startsWith('http') || normalized.includes(' ')) {
      continue;
    }
    if (normalized === '.' || normalized === '..' || normalized.startsWith('docs/implementation/execution')) {
      continue;
    }
    candidates.add(normalized);
  }
  return [...candidates].sort((a, b) => a.localeCompare(b));
}

function stripQuotes(value) {
  return String(value || '').trim().replace(/^['"]|['"]$/g, '');
}

function parseInlineArray(value) {
  const trimmed = String(value || '').trim();
  if (!trimmed.startsWith('[') || !trimmed.endsWith(']')) {
    return null;
  }
  const inner = trimmed.slice(1, -1).trim();
  if (!inner) {
    return [];
  }
  return inner.split(',').map((entry) => stripQuotes(entry)).filter(Boolean);
}

function parseMetadataScalar(value) {
  const trimmed = String(value || '').trim();
  const inlineArray = parseInlineArray(trimmed);
  if (inlineArray) {
    return inlineArray;
  }
  if (/^(true|false)$/i.test(trimmed)) {
    return trimmed.toLowerCase() === 'true';
  }
  if (/^[0-9]+$/.test(trimmed)) {
    return Number.parseInt(trimmed, 10);
  }
  return stripQuotes(trimmed);
}

function extractPhaseExecutionLines(text) {
  const lines = String(text || '').split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim() === 'phaseExecution:');
  if (start < 0) {
    return [];
  }
  const baseIndent = lines[start].length - lines[start].trimStart().length;
  const block = [];
  for (let index = start + 1; index < lines.length; index += 1) {
    const line = lines[index];
    const trimmed = line.trim();
    if (trimmed.startsWith('```')) {
      break;
    }
    if (trimmed && !trimmed.startsWith('#')) {
      const indent = line.length - line.trimStart().length;
      if (indent <= baseIndent) {
        break;
      }
    }
    block.push(line);
  }
  return block;
}

function parsePhaseExecutionMetadata(text) {
  const lines = extractPhaseExecutionLines(text);
  if (lines.length === 0) {
    return null;
  }
  const values = {};
  let currentKey = '';
  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }
    const listMatch = trimmed.match(/^-\s+(.+)$/);
    if (listMatch && currentKey) {
      if (!Array.isArray(values[currentKey])) {
        values[currentKey] = [];
      }
      values[currentKey].push(stripQuotes(listMatch[1]));
      continue;
    }
    const keyMatch = trimmed.match(/^([A-Za-z][A-Za-z0-9_-]*):\s*(.*)$/);
    if (!keyMatch) {
      continue;
    }
    const [, key, rawValue] = keyMatch;
    currentKey = key;
    if (!rawValue.trim()) {
      values[key] = [];
    } else {
      values[key] = parseMetadataScalar(rawValue);
      if (!Array.isArray(values[key])) {
        currentKey = '';
      }
    }
  }

  const arrayValue = (key) => (
    Array.isArray(values[key])
      ? values[key].map(stripQuotes).map(normalizePath).filter(Boolean)
      : []
  );
  const phaseRefs = (key) => (
    Array.isArray(values[key])
      ? values[key].map(stripQuotes).filter(Boolean)
      : []
  );

  return {
    schemaVersion: values.schemaVersion || 1,
    parallelEligible: values.parallelEligible === true,
    parallelGroup: stripQuotes(values.parallelGroup || ''),
    dependsOn: phaseRefs('dependsOn').map((value) => String(Number.parseInt(value, 10))).filter((value) => value !== 'NaN'),
    conflictsWith: phaseRefs('conflictsWith'),
    ownedPaths: arrayValue('ownedPaths'),
    readOnlyPaths: arrayValue('readOnlyPaths'),
    sharedMutablePaths: arrayValue('sharedMutablePaths'),
    requiresManualEvidence: values.requiresManualEvidence === true,
    mergePolicy: stripQuotes(values.mergePolicy || 'disjoint_patch'),
  };
}

function parseExplicitDependencies(text, phaseNum) {
  const dependencies = new Set();
  const lowered = String(text || '').toLowerCase();
  const patterns = [
    /\bdepends\s+on(?:\s+phases?)?:?\s*([0-9, ]+)/gi,
    /\bblocked\s+by(?:\s+phases?)?:?\s*([0-9, ]+)/gi,
    /\bafter\s+phase\s+([0-9]+)/gi,
    /\bfollow[- ]?up\s+(?:from|to)\s+phase\s+([0-9]+)/gi,
  ];
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const nums = String(match[1] || '').match(/[0-9]+/g) || [];
      for (const num of nums) {
        if (String(num) !== String(phaseNum)) {
          dependencies.add(String(Number.parseInt(num, 10)));
        }
      }
    }
  }
  const dependencySignal = /\b(depends?|dependency|after phase|follow[- ]?up|blocked by|requires phase|reuse previous phase|previous phase|regression from phase)\b/i.test(lowered);
  return {
    dependencies: [...dependencies].sort((a, b) => Number(a) - Number(b)),
    ambiguousDependency: dependencySignal && dependencies.size === 0,
  };
}

function formatPhaseRef(value) {
  const parsed = Number.parseInt(String(value || ''), 10);
  return Number.isNaN(parsed) ? String(value || '') : String(parsed);
}

function hasManualOrExternalState(text) {
  return /\b(manual smoke|windows terminal|external state|real browser|production|staging|credential|secret|oauth|login)\b/i.test(String(text || ''));
}

function isSharedMutablePath(filePath) {
  const normalized = normalizePath(filePath);
  return SHARED_MUTABLE_PATHS.has(normalized)
    || normalized.endsWith('/package.json')
    || normalized.endsWith('/package-lock.json')
    || normalized.endsWith('/pnpm-lock.yaml')
    || normalized.endsWith('/yarn.lock');
}

function pathsOverlap(left, right) {
  const a = normalizePath(left);
  const b = normalizePath(right);
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.includes('*') || b.includes('*')) {
    const prefixA = a.split('*')[0].replace(/\/+$/, '');
    const prefixB = b.split('*')[0].replace(/\/+$/, '');
    return Boolean(prefixA && prefixB && (prefixA.startsWith(prefixB) || prefixB.startsWith(prefixA)));
  }
  return a.startsWith(`${b}/`) || b.startsWith(`${a}/`);
}

function overlapPathPairs(leftPaths, rightPaths) {
  const pairs = [];
  for (const left of leftPaths || []) {
    for (const right of rightPaths || []) {
      if (pathsOverlap(left, right)) {
        pairs.push({ left, right });
      }
    }
  }
  return pairs;
}

function analyzePhase({ block, planDir, completed }) {
  const phaseDoc = getPhaseDoc(planDir, block.number);
  const text = readText(phaseDoc);
  const title = block.title || getPhaseTitle(phaseDoc, block.number);
  const metadata = parsePhaseExecutionMetadata(text);
  const planningSource = metadata ? 'phaseExecutionMetadata' : 'legacyExactExecutionTargets';
  const targets = metadata ? metadata.ownedPaths : extractTargetPaths(text);
  const dependency = metadata
    ? { dependencies: metadata.dependsOn, ambiguousDependency: false }
    : parseExplicitDependencies(text, block.number);
  const reasons = [];
  if (!phaseDoc) reasons.push('phase-doc-missing');
  if (metadata && metadata.parallelEligible !== true) reasons.push('parallel-disabled-by-metadata');
  if (targets.length === 0) reasons.push(metadata ? 'owned-paths-missing' : 'target-paths-missing');
  if (targets.some(isSharedMutablePath) || (metadata?.sharedMutablePaths || []).length > 0) reasons.push('shared-mutable-target');
  if (metadata?.requiresManualEvidence) reasons.push('requires-manual-evidence');
  if (metadata?.mergePolicy && metadata.mergePolicy !== 'disjoint_patch') reasons.push(`unsupported-merge-policy:${metadata.mergePolicy}`);
  if (!metadata && dependency.ambiguousDependency) reasons.push('ambiguous-dependency-signal');
  if (!metadata && hasManualOrExternalState(text)) reasons.push('manual-or-external-state-signal');
  const unmetDependencies = dependency.dependencies.filter((num) => !completed.has(String(num)));
  if (unmetDependencies.length > 0) reasons.push(`unmet-dependencies:${unmetDependencies.join(',')}`);
  return {
    number: String(block.number),
    title,
    phaseDoc,
    status: block.status,
    lastOutcome: block.lastOutcome,
    targets,
    ownedPaths: targets,
    readOnlyPaths: metadata?.readOnlyPaths || [],
    sharedMutablePaths: metadata?.sharedMutablePaths || [],
    conflictsWith: metadata?.conflictsWith || [],
    requiresManualEvidence: metadata?.requiresManualEvidence || false,
    mergePolicy: metadata?.mergePolicy || 'disjoint_patch',
    parallelGroup: metadata?.parallelGroup || '',
    planningSource,
    dependencies: dependency.dependencies,
    unmetDependencies,
    parallelEligible: reasons.length === 0,
    fallbackReasons: reasons,
  };
}

function conflictBetween(left, right) {
  const explicitConflict = (left.conflictsWith || []).map(formatPhaseRef).includes(String(right.number))
    || (right.conflictsWith || []).map(formatPhaseRef).includes(String(left.number));
  if (explicitConflict) {
    return {
      reason: 'explicit-conflict',
      phase: left.number,
      conflictsWith: right.number,
      paths: [],
    };
  }
  const pairs = overlapPathPairs(left.targets, right.targets);
  if (pairs.length > 0) {
    return {
      reason: 'target-overlap',
      phase: left.number,
      conflictsWith: right.number,
      paths: pairs,
    };
  }
  return null;
}

function buildWaveGroups(phases) {
  const groups = new Map();
  for (const phase of phases) {
    const key = phase.parallelGroup || 'ungrouped';
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key).push(phase.number);
  }
  return [...groups.entries()].map(([group, phaseNumbers]) => ({ group, phases: phaseNumbers }));
}

export function planPhaseExecution({ planDir, statusFile, waveCap = DEFAULT_WAVE_CAP }) {
  const blocks = readStatusBlocks(statusFile);
  const completed = new Set(blocks.filter((block) => block.status === 'completed').map((block) => String(block.number)));
  const active = blocks.find((block) => ACTIVE_STATUSES.has(block.status));
  const firstActionable = blocks.find((block) => (
    block.planConfirmed !== 'false'
    && !BLOCKED_STATUSES.has(block.status)
    && (RETRYABLE_STATUSES.has(block.status) || (block.status === 'in_progress' && block.lastOutcome === 'partial'))
  ));

  const base = {
    schemaVersion: '1.0',
    generatedAt: new Date().toISOString(),
    planner: 'phase-parallel-planner',
    planDir,
    statusFile,
    executionPlan: 'sequential',
    waveCap,
    phases: [],
    dependencyEdges: [],
    blockedPhases: [],
    fallbackReasons: [],
    confidence: 'low',
  };

  if ((process.env.PHASE_PARALLEL_AUTO ?? 'true') === 'false') {
    return {
      ...base,
      nextPhase: firstActionable?.number || '',
      fallbackReasons: ['parallel-auto-disabled'],
    };
  }
  if (active) {
    return {
      ...base,
      nextPhase: active.number,
      fallbackReasons: [`active-phase-running:${active.number}`],
    };
  }
  if (!firstActionable) {
    return {
      ...base,
      nextPhase: '',
      fallbackReasons: ['no-actionable-phase'],
    };
  }

  const candidates = blocks
    .filter((block) => block.planConfirmed !== 'false')
    .filter((block) => RETRYABLE_STATUSES.has(block.status))
    .map((block) => analyzePhase({ block, planDir, completed }));

  const blockedPhases = candidates.filter((phase) => !phase.parallelEligible);
  const eligible = candidates.filter((phase) => phase.parallelEligible);
  const wave = [];
  const overlapDetails = [];

  for (const phase of eligible) {
    if (wave.length >= waveCap) break;
    const conflict = wave.map((existing) => conflictBetween(phase, existing)).find(Boolean);
    if (conflict) {
      overlapDetails.push(conflict);
      continue;
    }
    wave.push(phase);
  }

  const dependencyEdges = candidates.flatMap((phase) => (
    phase.dependencies.map((dependency) => ({ from: dependency, to: phase.number }))
  ));

  if (wave.length < 2) {
    return {
      ...base,
      nextPhase: firstActionable.number,
      phases: wave,
      dependencyEdges,
      blockedPhases,
      blockedPhaseDetails: blockedPhases.map((phase) => ({
        number: phase.number,
        title: phase.title,
        planningSource: phase.planningSource,
        fallbackReasons: phase.fallbackReasons,
      })),
      overlapDetails,
      waveGroups: buildWaveGroups(wave),
      fallbackReasons: [
        'parallel-wave-too-small',
        ...blockedPhases.map((phase) => `phase-${phase.number}:${phase.fallbackReasons.join('|')}`),
        ...overlapDetails.map((detail) => `${detail.reason}:${detail.phase}:${detail.conflictsWith}`),
      ].filter(Boolean),
      confidence: wave.length === 1 ? 'medium' : 'low',
    };
  }

  return {
    ...base,
    executionPlan: 'parallel_wave',
    nextPhase: wave[0].number,
    phases: wave,
    dependencyEdges,
    blockedPhases,
    blockedPhaseDetails: blockedPhases.map((phase) => ({
      number: phase.number,
      title: phase.title,
      planningSource: phase.planningSource,
      fallbackReasons: phase.fallbackReasons,
    })),
    overlapDetails,
    waveGroups: buildWaveGroups(wave),
    fallbackReasons: [
      ...blockedPhases.map((phase) => `phase-${phase.number}:${phase.fallbackReasons.join('|')}`),
      ...overlapDetails.map((detail) => `${detail.reason}:${detail.phase}:${detail.conflictsWith}`),
    ].filter(Boolean),
    confidence: 'medium',
  };
}

function parseArgs(argv) {
  const args = [...argv];
  const options = {
    planDir: '',
    statusFile: '.claude/docs/phase-status.yaml',
    waveCap: DEFAULT_WAVE_CAP,
    selfTest: false,
  };
  while (args.length > 0) {
    const arg = args.shift();
    switch (arg) {
      case 'self-test':
        options.selfTest = true;
        break;
      case '--plan-dir':
        options.planDir = args.shift() ?? '';
        break;
      case '--status-file':
        options.statusFile = args.shift() ?? '';
        break;
      case '--wave-cap':
        options.waveCap = Number.parseInt(args.shift() ?? String(DEFAULT_WAVE_CAP), 10) || DEFAULT_WAVE_CAP;
        break;
      case '--help':
      case '-h':
        writeStdoutLine('Usage: phase-parallel-planner.mjs --plan-dir <dir> --status-file <file> [--wave-cap N]');
        process.exit(0);
      default:
        throw new Error(`Unknown option: ${arg}`);
    }
  }
  return options;
}

function writeFixture(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
}

function runSelfTest() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'phase-parallel-planner-'));
  const planDir = path.join(root, 'docs', 'implementation');
  const statusFile = path.join(root, '.claude', 'docs', 'phase-status.yaml');
  writeFixture(path.join(planDir, '01-alpha.md'), '# Phase 01: Alpha\n\n## Exact Execution Targets\n- `src/alpha.ts`\n');
  writeFixture(path.join(planDir, '02-beta.md'), '# Phase 02: Beta\n\n## Exact Execution Targets\n- `src/beta.ts`\n');
  writeFixture(path.join(planDir, '03-gamma.md'), '# Phase 03: Gamma\n\nDepends on phases: 1, 2\n\n## Exact Execution Targets\n- `src/gamma.ts`\n');
  writeFixture(statusFile, `phases:
  - number: 1
    title: Alpha
    status: pending
    planConfirmed: true
    attempts:
      lastOutcome: pending
  - number: 2
    title: Beta
    status: pending
    planConfirmed: true
    attempts:
      lastOutcome: pending
  - number: 3
    title: Gamma
    status: pending
    planConfirmed: true
    attempts:
      lastOutcome: pending
`);
  const parallel = planPhaseExecution({ planDir, statusFile, waveCap: 3 });
  if (parallel.executionPlan !== 'parallel_wave' || parallel.phases.length !== 2) {
    throw new Error(`expected two-phase wave, got ${JSON.stringify(parallel)}`);
  }
  writeFixture(path.join(planDir, '02-beta.md'), '# Phase 02: Beta\n\n## Exact Execution Targets\n- `src/alpha.ts`\n');
  const overlap = planPhaseExecution({ planDir, statusFile, waveCap: 3 });
  if (overlap.executionPlan !== 'sequential') {
    throw new Error(`expected overlap fallback, got ${JSON.stringify(overlap)}`);
  }
  if (!Array.isArray(overlap.overlapDetails) || overlap.overlapDetails[0]?.paths?.[0]?.left !== 'src/alpha.ts') {
    throw new Error(`expected overlap details, got ${JSON.stringify(overlap.overlapDetails)}`);
  }
  writeFixture(path.join(planDir, '01-alpha.md'), `# Phase 01: Alpha

## Phase Execution Metadata
\`\`\`yaml
phaseExecution:
  schemaVersion: 1
  parallelEligible: true
  parallelGroup: wave-one
  dependsOn: []
  conflictsWith: []
  ownedPaths:
    - src/metadata-alpha.ts
  readOnlyPaths:
    - docs/spec.md
  sharedMutablePaths: []
  requiresManualEvidence: false
  mergePolicy: disjoint_patch
\`\`\`
`);
  writeFixture(path.join(planDir, '02-beta.md'), `# Phase 02: Beta

## Phase Execution Metadata
\`\`\`yaml
phaseExecution:
  schemaVersion: 1
  parallelEligible: true
  parallelGroup: wave-one
  dependsOn: []
  conflictsWith: []
  ownedPaths:
    - src/metadata-beta.ts
  readOnlyPaths: []
  sharedMutablePaths: []
  requiresManualEvidence: false
  mergePolicy: disjoint_patch
\`\`\`
`);
  const metadataPlan = planPhaseExecution({ planDir, statusFile, waveCap: 3 });
  if (metadataPlan.executionPlan !== 'parallel_wave' || metadataPlan.phases[0]?.planningSource !== 'phaseExecutionMetadata') {
    throw new Error(`expected metadata-first wave, got ${JSON.stringify(metadataPlan)}`);
  }
  writeFixture(path.join(planDir, '02-beta.md'), `# Phase 02: Beta

## Phase Execution Metadata
\`\`\`yaml
phaseExecution:
  schemaVersion: 1
  parallelEligible: true
  parallelGroup: wave-one
  dependsOn: []
  conflictsWith: []
  ownedPaths:
    - src/metadata-alpha.ts
  readOnlyPaths: []
  sharedMutablePaths: []
  requiresManualEvidence: false
  mergePolicy: disjoint_patch
\`\`\`
`);
  const metadataOverlap = planPhaseExecution({ planDir, statusFile, waveCap: 3 });
  if (metadataOverlap.executionPlan !== 'sequential' || metadataOverlap.overlapDetails[0]?.reason !== 'target-overlap') {
    throw new Error(`expected metadata overlap fallback, got ${JSON.stringify(metadataOverlap)}`);
  }
  writeFixture(path.join(planDir, '02-beta.md'), `# Phase 02: Beta

## Phase Execution Metadata
\`\`\`yaml
phaseExecution:
  schemaVersion: 1
  parallelEligible: true
  parallelGroup: wave-one
  dependsOn: []
  conflictsWith: []
  ownedPaths:
    - src/metadata-beta.ts
  readOnlyPaths: []
  sharedMutablePaths: []
  requiresManualEvidence: true
  mergePolicy: disjoint_patch
\`\`\`
`);
  const manualBlocked = planPhaseExecution({ planDir, statusFile, waveCap: 3 });
  if (!manualBlocked.blockedPhaseDetails.some((phase) => phase.number === '2' && phase.fallbackReasons.includes('requires-manual-evidence'))) {
    throw new Error(`expected manual evidence block detail, got ${JSON.stringify(manualBlocked.blockedPhaseDetails)}`);
  }
  writeStdoutLine('phase-parallel-planner self-test passed');
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  try {
    const options = parseArgs(process.argv.slice(2));
    if (options.selfTest) {
      runSelfTest();
    } else {
      if (!options.planDir) {
        throw new Error('--plan-dir is required');
      }
      writeStdoutLine(JSON.stringify(planPhaseExecution(options), null, 2));
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
