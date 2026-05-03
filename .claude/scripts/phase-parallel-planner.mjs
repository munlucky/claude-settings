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

function analyzePhase({ block, planDir, completed }) {
  const phaseDoc = getPhaseDoc(planDir, block.number);
  const text = readText(phaseDoc);
  const title = block.title || getPhaseTitle(phaseDoc, block.number);
  const targets = extractTargetPaths(text);
  const dependency = parseExplicitDependencies(text, block.number);
  const reasons = [];
  if (!phaseDoc) reasons.push('phase-doc-missing');
  if (targets.length === 0) reasons.push('target-paths-missing');
  if (targets.some(isSharedMutablePath)) reasons.push('shared-mutable-target');
  if (dependency.ambiguousDependency) reasons.push('ambiguous-dependency-signal');
  if (hasManualOrExternalState(text)) reasons.push('manual-or-external-state-signal');
  const unmetDependencies = dependency.dependencies.filter((num) => !completed.has(String(num)));
  if (unmetDependencies.length > 0) reasons.push(`unmet-dependencies:${unmetDependencies.join(',')}`);
  return {
    number: String(block.number),
    title,
    phaseDoc,
    status: block.status,
    lastOutcome: block.lastOutcome,
    targets,
    dependencies: dependency.dependencies,
    unmetDependencies,
    parallelEligible: reasons.length === 0,
    fallbackReasons: reasons,
  };
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
  const conflictReasons = [];

  for (const phase of eligible) {
    if (wave.length >= waveCap) break;
    const conflict = wave.find((existing) => (
      phase.targets.some((target) => existing.targets.some((other) => pathsOverlap(target, other)))
    ));
    if (conflict) {
      conflictReasons.push(`target-overlap:${phase.number}:${conflict.number}`);
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
      fallbackReasons: [
        'parallel-wave-too-small',
        ...blockedPhases.map((phase) => `phase-${phase.number}:${phase.fallbackReasons.join('|')}`),
        ...conflictReasons,
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
    fallbackReasons: [
      ...blockedPhases.map((phase) => `phase-${phase.number}:${phase.fallbackReasons.join('|')}`),
      ...conflictReasons,
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
