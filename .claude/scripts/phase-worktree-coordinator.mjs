#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolveCodexReasoningEffort } from './lib/effort-profile.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const prepareWorktreeScript = path.join(SCRIPT_DIR, 'harness-prepare-worktree.mjs');
const runtimeCliPath = path.join(SCRIPT_DIR, 'runtime-cli.mjs');
const logDir = path.join('.claude', 'logs', 'agent-loop');

const state = {
  phaseExecutionDir: '',
  planDir: '',
  phaseNum: '',
  phaseTitle: '',
  phaseDoc: '',
  runtime: 'auto',
  baseRef: 'HEAD',
  worktreeRoot: '.tmp/harness-worktrees/phase-runs',
  parallelWorktrees: Number.parseInt(process.env.PHASE_PARALLEL_WORKTREES ?? '1', 10) || 1,
  worksetsFile: '',
  qaReport: '',
  handoff: '',
  scorecard: '',
  dryRun: false,
};

function usage() {
  console.error([
    'Usage:',
    '  phase-worktree-coordinator.mjs <phase-execution-dir> [options]',
    '  phase-worktree-coordinator.mjs self-test',
    '',
    'Options:',
    '  --plan-dir <path>',
    '  --phase-num <n>',
    '  --phase-title <title>',
    '  --phase-doc <path>',
    '  --runtime <auto|claude|codex>',
    '  --worksets-file <path>       Default: <phase-execution-dir>/WORKSETS.yaml',
    '  --base <ref>                 Default: HEAD',
    '  --worktree-root <path>       Default: .tmp/harness-worktrees/phase-runs',
    '  --parallel-worktrees <n>     Opt-in when n >= 2',
    '  --qa-report <path>',
    '  --handoff <path>',
    '  --scorecard <path>',
    '  --dry-run',
  ].join('\n'));
}

function writeStdoutLine(value = '') {
  process.stdout.write(`${String(value)}\n`);
}

function parseArgs(argv) {
  const args = [...argv];
  if (args[0] === 'self-test') {
    return { selfTest: true };
  }
  if (args.length > 0 && !args[0].startsWith('--')) {
    state.phaseExecutionDir = args.shift();
  }
  while (args.length > 0) {
    const arg = args.shift();
    switch (arg) {
      case '--plan-dir':
        state.planDir = args.shift() ?? '';
        break;
      case '--phase-num':
        state.phaseNum = args.shift() ?? '';
        break;
      case '--phase-title':
        state.phaseTitle = args.shift() ?? '';
        break;
      case '--phase-doc':
        state.phaseDoc = args.shift() ?? '';
        break;
      case '--runtime':
        state.runtime = args.shift() ?? 'auto';
        break;
      case '--worksets-file':
        state.worksetsFile = args.shift() ?? '';
        break;
      case '--base':
        state.baseRef = args.shift() ?? 'HEAD';
        break;
      case '--worktree-root':
        state.worktreeRoot = args.shift() ?? '';
        break;
      case '--parallel-worktrees':
        state.parallelWorktrees = Number.parseInt(args.shift() ?? '1', 10) || 1;
        break;
      case '--qa-report':
        state.qaReport = args.shift() ?? '';
        break;
      case '--handoff':
        state.handoff = args.shift() ?? '';
        break;
      case '--scorecard':
        state.scorecard = args.shift() ?? '';
        break;
      case '--dry-run':
        state.dryRun = true;
        break;
      case '--help':
      case '-h':
        usage();
        process.exit(0);
        break;
      default:
        throw new Error(`Unknown option: ${arg}`);
    }
  }
  return { selfTest: false };
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    ...options,
  });
  return {
    status: result.status ?? 0,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    error: result.error ?? null,
  };
}

function runRequired(command, args, options = {}) {
  const result = run(command, args, options);
  if (result.status !== 0 || result.error) {
    const detail = result.error?.message || result.stderr || result.stdout || `${command} failed`;
    throw new Error(detail.trim());
  }
  return result.stdout.trim();
}

function repoRoot(cwd = process.cwd()) {
  return runRequired('git', ['rev-parse', '--show-toplevel'], { cwd });
}

function normalizePath(value) {
  return String(value || '').replaceAll('\\', '/').replace(/^\.\//, '').replace(/\/+$/, '');
}

function parseScalar(raw) {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return '';
  return trimmed.replace(/^["']|["']$/g, '');
}

function parseInlineArray(raw) {
  const value = String(raw || '').trim();
  if (!value.startsWith('[') || !value.endsWith(']')) {
    return null;
  }
  const body = value.slice(1, -1).trim();
  if (!body) return [];
  return body.split(',').map((item) => parseScalar(item)).filter(Boolean);
}

function parseWorksetsYaml(filePath) {
  if (!filePath || !fs.existsSync(filePath)) {
    return [];
  }
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
  const worksets = [];
  let current = null;
  let activeList = '';
  for (const rawLine of lines) {
    const noComment = rawLine.replace(/\s+#.*$/, '');
    if (!noComment.trim() || noComment.trim() === 'worksets:') {
      continue;
    }
    const itemMatch = noComment.match(/^\s*-\s+([A-Za-z][A-Za-z0-9]*):\s*(.*)$/);
    if (itemMatch && noComment.startsWith('  -')) {
      if (current) worksets.push(current);
      current = {
        id: '',
        summary: '',
        ownedPaths: [],
        commands: [],
        verificationCommands: [],
        dependsOn: [],
        mergeOrder: 0,
      };
      activeList = '';
      current[itemMatch[1]] = itemMatch[1] === 'mergeOrder'
        ? Number.parseInt(itemMatch[2] || '0', 10) || 0
        : parseScalar(itemMatch[2]);
      continue;
    }
    if (!current) {
      continue;
    }
    const keyMatch = noComment.match(/^\s+([A-Za-z][A-Za-z0-9]*):\s*(.*)$/);
    if (keyMatch) {
      const key = keyMatch[1];
      const value = keyMatch[2] ?? '';
      const inline = parseInlineArray(value);
      if (inline) {
        current[key] = inline;
        activeList = '';
      } else if (['ownedPaths', 'commands', 'verificationCommands', 'dependsOn'].includes(key)) {
        current[key] = [];
        activeList = key;
      } else if (key === 'mergeOrder') {
        current[key] = Number.parseInt(value || '0', 10) || 0;
        activeList = '';
      } else {
        current[key] = parseScalar(value);
        activeList = '';
      }
      continue;
    }
    const listMatch = noComment.match(/^\s+-\s+(.*)$/);
    if (activeList && listMatch) {
      current[activeList].push(parseScalar(listMatch[1]));
    }
  }
  if (current) worksets.push(current);
  return worksets
    .filter((workset) => workset.id)
    .map((workset) => ({
      ...workset,
      ownedPaths: (workset.ownedPaths || []).map(normalizePath).filter(Boolean),
      commands: (workset.commands || []).filter(Boolean),
      verificationCommands: (workset.verificationCommands || []).filter(Boolean),
      dependsOn: (workset.dependsOn || []).filter(Boolean),
      mergeOrder: Number.parseInt(workset.mergeOrder || '0', 10) || 0,
    }));
}

function globToRegex(pattern) {
  const normalized = normalizePath(pattern);
  const escaped = normalized
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '___DOUBLE_STAR___')
    .replace(/\*/g, '[^/]*')
    .replace(/___DOUBLE_STAR___/g, '.*');
  return new RegExp(`^${escaped}$`);
}

function pathMatchesOwnedPath(filePath, ownedPath) {
  const file = normalizePath(filePath);
  const owned = normalizePath(ownedPath);
  if (!owned) return false;
  if (owned.includes('*')) {
    return globToRegex(owned).test(file);
  }
  return file === owned || file.startsWith(`${owned}/`);
}

function ownedPatternsOverlap(a, b) {
  const left = normalizePath(a);
  const right = normalizePath(b);
  if (!left || !right) return false;
  if (left === right) return true;
  if (!left.includes('*') && !right.includes('*')) {
    return left.startsWith(`${right}/`) || right.startsWith(`${left}/`);
  }
  return false;
}

function validateWorksets(worksets) {
  const reasons = [];
  if (worksets.length === 0) {
    reasons.push('worksets-empty');
  }
  for (const workset of worksets) {
    if (!Array.isArray(workset.ownedPaths) || workset.ownedPaths.length === 0) {
      reasons.push(`workset:${workset.id}:ownedPaths-empty`);
    }
    if (Array.isArray(workset.dependsOn) && workset.dependsOn.length > 0) {
      reasons.push(`workset:${workset.id}:dependsOn-not-empty`);
    }
  }
  for (let i = 0; i < worksets.length; i += 1) {
    for (let j = i + 1; j < worksets.length; j += 1) {
      for (const left of worksets[i].ownedPaths) {
        for (const right of worksets[j].ownedPaths) {
          if (ownedPatternsOverlap(left, right)) {
            reasons.push(`ownedPaths-overlap:${worksets[i].id}:${worksets[j].id}:${left}:${right}`);
          }
        }
      }
    }
  }
  return {
    ok: reasons.length === 0,
    fallback: reasons.length > 0 && reasons.every((reason) => (
      reason.includes('dependsOn')
      || reason.includes('ownedPaths-empty')
      || reason.includes('ownedPaths-overlap')
      || reason === 'worksets-empty'
    )),
    reasons,
  };
}

function runShellCommand(command, cwd, artifactPath) {
  const shell = process.platform === 'win32' ? process.env.ComSpec || 'cmd.exe' : process.env.SHELL || '/bin/sh';
  const args = process.platform === 'win32' ? ['/d', '/s', '/c', command] : ['-lc', command];
  const result = run(shell, args, { cwd });
  fs.mkdirSync(path.dirname(artifactPath), { recursive: true });
  fs.writeFileSync(artifactPath, [
    `$ ${command}`,
    '',
    '--- stdout ---',
    result.stdout || '',
    '--- stderr ---',
    result.stderr || '',
    result.error ? `--- error ---\n${result.error.message}` : '',
  ].join('\n'), 'utf8');
  return result.status;
}

function runtimeCli(args, cwd = process.cwd()) {
  const result = run('node', [runtimeCliPath, ...args], { cwd });
  if (result.status !== 0 || result.error) {
    return [];
  }
  return result.stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

function buildRuntimeCommand(prompt, runtime, cwd) {
  if (runtime === 'claude') {
    return ['claude', '--dangerously-skip-permissions', '--no-session-persistence', '-p', prompt];
  }
  const args = runtimeCli(['codex-base-args', cwd]);
  const effort = resolveCodexReasoningEffort({
    explicitEffort: process.env.AGENT_LOOP_CODEX_REASONING_EFFORT ?? process.env.MOONSHOT_CODEX_REASONING_EFFORT,
    profile: process.env.AGENT_LOOP_EFFORT_PROFILE ?? process.env.MOONSHOT_EFFORT_PROFILE,
    defaultProfile: 'deep',
  });
  if (effort) {
    args.push('-c', `model_reasoning_effort="${effort}"`);
  }
  args.push(prompt);
  return args;
}

function runRuntimePrompt(command, cwd, artifactPath) {
  return new Promise((resolve) => {
    fs.mkdirSync(path.dirname(artifactPath), { recursive: true });
    const output = fs.createWriteStream(artifactPath, { flags: 'a' });
    output.write(`$ ${command.join(' ')}\n\n`);
    const child = spawn(command[0], command.slice(1), {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: process.env,
    });
    child.stdout.pipe(output, { end: false });
    child.stderr.pipe(output, { end: false });
    child.on('error', (error) => {
      output.write(`\n--- error ---\n${error.message}\n`);
      output.end();
      resolve(1);
    });
    child.on('exit', (code) => {
      output.end();
      resolve(code ?? 1);
    });
  });
}

function isHarnessGeneratedPath(filePath) {
  const normalized = normalizePath(filePath);
  return normalized === 'AGENTS.md'
    || normalized.startsWith('.agents/')
    || normalized === '.claude/worktree-prepare.json'
    || normalized === '.claude/worktree-setup.log'
    || normalized === '.claude/worktree-baseline.log'
    || normalized.startsWith('.claude/logs/');
}

function collectChangedFiles(worktreePath, workset) {
  const untracked = run('git', ['ls-files', '--others', '--exclude-standard'], { cwd: worktreePath })
    .stdout.split(/\r?\n/).map(normalizePath).filter(Boolean)
    .filter((filePath) => !isHarnessGeneratedPath(filePath));
  const ownedUntracked = untracked.filter((filePath) => {
    return workset.ownedPaths.some((ownedPath) => pathMatchesOwnedPath(filePath, ownedPath));
  });
  if (ownedUntracked.length > 0) {
    run('git', ['add', '-N', '--', ...ownedUntracked], { cwd: worktreePath });
  }
  const tracked = runRequired('git', ['diff', '--name-only', state.baseRef, '--'], { cwd: worktreePath })
    .split(/\r?\n/).map(normalizePath).filter(Boolean)
    .filter((filePath) => !isHarnessGeneratedPath(filePath));
  return [...new Set([...tracked, ...untracked])];
}

function buildWorksetPrompt(workset) {
  return `Phase ${state.phaseNum} parallel workset execution.

Workset:
- id: ${workset.id}
- summary: ${workset.summary || ''}
- ownedPaths: ${workset.ownedPaths.join(', ')}
- phaseDoc: ${state.phaseDoc}
- phaseExecutionDir: ${state.phaseExecutionDir}

Rules:
1. Edit only ownedPaths for this workset.
2. Do not modify phase-level QA_REPORT.md, HANDOFF.md, SCORECARD.md, or WORKSETS.yaml.
3. Run the workset verification commands if they are relevant and available.
4. Leave a concise result in the command output only. The outer coordinator merges and updates phase artifacts.`;
}

function sanitizeId(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'workset';
}

function prepareWorktree({ root, runId, workset }) {
  const taskId = `phase-${state.phaseNum}-${sanitizeId(workset.id)}-${runId}`;
  const worktreePath = path.resolve(root, state.worktreeRoot, taskId);
  const branch = `codex/phase-${state.phaseNum}-${sanitizeId(workset.id)}-${runId}`;
  const args = [
    prepareWorktreeScript,
    taskId,
    '--worktree-path',
    worktreePath,
    '--branch',
    branch,
    '--base',
    state.baseRef,
    '--hydrate-agent-config',
    '--agent-config-source',
    path.join(root, '.claude'),
  ];
  const result = run('node', args, { cwd: root });
  if (result.status !== 0 || result.error) {
    throw new Error(result.error?.message || result.stderr || result.stdout || `worktree prepare failed for ${workset.id}`);
  }
  return { taskId, worktreePath, branch };
}

async function runWorkset({ root, runId, workset }) {
  const prepared = state.dryRun
    ? { taskId: `dry-${workset.id}`, worktreePath: '', branch: `codex/phase-${state.phaseNum}-${sanitizeId(workset.id)}-${runId}` }
    : prepareWorktree({ root, runId, workset });
  const artifactDir = state.dryRun ? logDir : path.join(prepared.worktreePath, '.claude', 'logs', 'agent-loop');
  const logFile = path.join(artifactDir, `workset-${sanitizeId(workset.id)}.log`);
  let exitCode = 0;
  if (!state.dryRun) {
    for (const command of workset.commands) {
      exitCode = runShellCommand(command, prepared.worktreePath, logFile);
      if (exitCode !== 0) break;
    }
    if (exitCode === 0 && workset.commands.length === 0) {
      const runtimeCommand = buildRuntimeCommand(buildWorksetPrompt(workset), state.runtime === 'auto' ? 'codex' : state.runtime, prepared.worktreePath);
      exitCode = await runRuntimePrompt(runtimeCommand, prepared.worktreePath, logFile);
    }
    if (exitCode === 0) {
      for (const command of workset.verificationCommands) {
        exitCode = runShellCommand(command, prepared.worktreePath, logFile);
        if (exitCode !== 0) break;
      }
    }
  }
  const changedFiles = state.dryRun || exitCode !== 0
    ? []
    : collectChangedFiles(prepared.worktreePath, workset);
  const outsideOwnedPaths = changedFiles.filter((filePath) => !workset.ownedPaths.some((ownedPath) => pathMatchesOwnedPath(filePath, ownedPath)));
  return {
    ...prepared,
    id: workset.id,
    summary: workset.summary,
    ownedPaths: workset.ownedPaths,
    mergeOrder: workset.mergeOrder,
    logFile,
    status: exitCode === 0 && outsideOwnedPaths.length === 0 ? 'completed' : 'failed',
    exitCode,
    changedFiles,
    outsideOwnedPaths,
    blockedReason: outsideOwnedPaths.length > 0 ? `outside-owned-paths:${outsideOwnedPaths.join(',')}` : '',
    mergeStatus: 'pending',
  };
}

async function mapLimited(items, limit, mapper) {
  const results = new Array(items.length);
  let index = 0;
  async function worker() {
    while (index < items.length) {
      const current = index;
      index += 1;
      results[current] = await mapper(items[current], current);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return results;
}

function detectChangedFileConflicts(results) {
  const owners = new Map();
  const conflicts = [];
  for (const result of results) {
    for (const filePath of result.changedFiles || []) {
      if (owners.has(filePath)) {
        conflicts.push(`${filePath}:${owners.get(filePath)}:${result.id}`);
      } else {
        owners.set(filePath, result.id);
      }
    }
  }
  return conflicts;
}

function applyWorksetPatch(result) {
  if (!result.changedFiles || result.changedFiles.length === 0) {
    result.mergeStatus = 'no_changes';
    return;
  }
  const patchResult = run('git', ['diff', '--binary', state.baseRef, '--'], { cwd: result.worktreePath });
  if (patchResult.status !== 0 || patchResult.error) {
    result.mergeStatus = 'failed';
    result.blockedReason = patchResult.error?.message || patchResult.stderr || patchResult.stdout || 'git-diff-failed';
    throw new Error(`merge diff failed for ${result.id}: ${result.blockedReason}`);
  }
  const apply = run('git', ['apply', '--3way', '--whitespace=nowarn', '-'], {
    cwd: process.cwd(),
    input: patchResult.stdout,
  });
  if (apply.status !== 0 || apply.error) {
    result.mergeStatus = 'failed';
    result.blockedReason = apply.error?.message || apply.stderr || apply.stdout || 'git-apply-failed';
    throw new Error(`merge failed for ${result.id}: ${result.blockedReason}`);
  }
  result.mergeStatus = 'merged';
}

function writeJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function appendIfPath(filePath, text) {
  if (!filePath) return;
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.appendFileSync(filePath, `\n${text.trimEnd()}\n`, 'utf8');
}

function appendPhaseSummary(payload) {
  const completed = payload.worksets.filter((item) => item.status === 'completed').length;
  const failed = payload.worksets.filter((item) => item.status !== 'completed').length;
  const detail = `## Parallel Worktree Execution
- Run id: ${payload.runId}
- Status: ${payload.status}
- Completed worksets: ${completed}
- Failed worksets: ${failed}
- Merge status: ${payload.mergeStatus}
- Artifact: ${payload.artifactPath}
`;
  appendIfPath(state.qaReport, detail);
  appendIfPath(state.handoff, detail);
  appendIfPath(state.scorecard, detail);
}

async function runCoordinator() {
  if (!state.phaseExecutionDir) {
    throw new Error('phase execution dir is required');
  }
  state.worksetsFile = state.worksetsFile || path.join(state.phaseExecutionDir, 'WORKSETS.yaml');
  if (state.parallelWorktrees < 2) {
    return { exitCode: 78, reason: 'parallel-worktrees-disabled' };
  }
  const worksets = parseWorksetsYaml(state.worksetsFile);
  const validation = validateWorksets(worksets);
  if (!validation.ok) {
    return { exitCode: validation.fallback ? 78 : 2, reason: validation.reasons.join(';') };
  }
  const root = repoRoot();
  const runId = `${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
  const artifactPath = path.join(logDir, `parallel-phase-run-${runId}.json`);
  const payload = {
    schemaVersion: '1.0',
    runId,
    phaseNum: state.phaseNum,
    phaseTitle: state.phaseTitle,
    phaseExecutionDir: state.phaseExecutionDir,
    worksetsFile: state.worksetsFile,
    baseRef: state.baseRef,
    worktreeRoot: state.worktreeRoot,
    parallelWorktrees: state.parallelWorktrees,
    status: 'running',
    mergeStatus: 'pending',
    blockedReason: '',
    worksets: [],
    generatedAt: new Date().toISOString(),
    artifactPath,
  };
  writeJson(artifactPath, payload);
  const results = await mapLimited(worksets, state.parallelWorktrees, (workset) => runWorkset({ root, runId, workset }));
  payload.worksets = results;
  const failed = results.find((result) => result.status !== 'completed');
  if (failed) {
    payload.status = 'blocked';
    payload.mergeStatus = 'not_started';
    payload.blockedReason = failed.blockedReason || `workset-failed:${failed.id}:exit=${failed.exitCode}`;
    writeJson(artifactPath, payload);
    appendPhaseSummary(payload);
    return { exitCode: 2, reason: payload.blockedReason, artifactPath };
  }
  const conflicts = detectChangedFileConflicts(results);
  if (conflicts.length > 0) {
    payload.status = 'blocked';
    payload.mergeStatus = 'blocked';
    payload.blockedReason = `changed-file-conflict:${conflicts.join(',')}`;
    writeJson(artifactPath, payload);
    appendPhaseSummary(payload);
    return { exitCode: 2, reason: payload.blockedReason, artifactPath };
  }
  for (const result of [...results].sort((a, b) => a.mergeOrder - b.mergeOrder || a.id.localeCompare(b.id))) {
    if (!state.dryRun) {
      applyWorksetPatch(result);
    } else {
      result.mergeStatus = 'dry_run';
    }
  }
  payload.status = 'completed';
  payload.mergeStatus = 'merged';
  payload.finishedAt = new Date().toISOString();
  writeJson(artifactPath, payload);
  appendPhaseSummary(payload);
  return { exitCode: 0, reason: 'completed', artifactPath };
}

function writeFixture(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
}

function initFixtureRepo(root) {
  fs.mkdirSync(root, { recursive: true });
  runRequired('git', ['init'], { cwd: root });
  runRequired('git', ['config', 'user.email', 'parallel-test@example.invalid'], { cwd: root });
  runRequired('git', ['config', 'user.name', 'Parallel Test'], { cwd: root });
  writeFixture(path.join(root, 'a.txt'), 'a\n');
  writeFixture(path.join(root, 'b.txt'), 'b\n');
  writeFixture(path.join(root, 'outside.txt'), 'outside\n');
  writeFixture(path.join(root, 'tools', 'append.mjs'), "import fs from 'node:fs';\nfs.appendFileSync(process.argv[2], `${process.argv[3]}\\n`, 'utf8');\n");
  writeFixture(path.join(root, '.claude', 'CLAUDE.md'), '# fixture\n');
  writeFixture(path.join(root, '.claude', 'verification.contract.yaml'), 'commands: {}\n');
  writeFixture(path.join(root, '.claude', 'scripts', '.keep'), '');
  writeFixture(path.join(root, '.claude', 'skills', '.keep'), '');
  runRequired('git', ['add', '.'], { cwd: root });
  runRequired('git', ['commit', '-m', 'fixture'], { cwd: root });
}

function runSelfCoordinator(root, worksetsYaml) {
  const phaseDir = path.join(root, 'plan', 'execution', '01-smoke');
  fs.mkdirSync(phaseDir, { recursive: true });
  writeFixture(path.join(phaseDir, 'WORKSETS.yaml'), worksetsYaml);
  const result = run('node', [
    fileURLToPath(import.meta.url),
    phaseDir,
    '--phase-num', '1',
    '--phase-title', 'Smoke',
    '--runtime', 'codex',
    '--parallel-worktrees', '2',
    '--base', 'HEAD',
    '--worktree-root', '.tmp/harness-worktrees/phase-runs',
    '--qa-report', path.join(phaseDir, 'QA_REPORT.md'),
    '--handoff', path.join(phaseDir, 'HANDOFF.md'),
    '--scorecard', path.join(phaseDir, 'SCORECARD.md'),
  ], { cwd: root });
  return result;
}

function selfTest() {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'phase-worktree-coordinator-'));
  const okRepo = path.join(tmpRoot, 'ok');
  initFixtureRepo(okRepo);
  const ok = runSelfCoordinator(okRepo, `worksets:
  - id: alpha
    summary: alpha
    ownedPaths: [a.txt]
    commands:
      - node tools/append.mjs a.txt alpha
    verificationCommands: []
    dependsOn: []
    mergeOrder: 1
  - id: beta
    summary: beta
    ownedPaths: [b.txt]
    commands:
      - node tools/append.mjs b.txt beta
    verificationCommands: []
    dependsOn: []
    mergeOrder: 2
`);
  if (ok.status !== 0) {
    throw new Error(`success smoke failed: ${ok.stderr || ok.stdout}`);
  }
  if (!fs.readFileSync(path.join(okRepo, 'a.txt'), 'utf8').includes('alpha')) {
    throw new Error('success smoke did not merge a.txt');
  }
  if (!fs.readFileSync(path.join(okRepo, 'b.txt'), 'utf8').includes('beta')) {
    throw new Error('success smoke did not merge b.txt');
  }

  const outsideRepo = path.join(tmpRoot, 'outside');
  initFixtureRepo(outsideRepo);
  const outside = runSelfCoordinator(outsideRepo, `worksets:
  - id: alpha
    ownedPaths: [a.txt]
    commands:
      - node tools/append.mjs outside.txt bad
    verificationCommands: []
    dependsOn: []
    mergeOrder: 1
  - id: beta
    ownedPaths: [b.txt]
    commands:
      - node tools/append.mjs b.txt beta
    verificationCommands: []
    dependsOn: []
    mergeOrder: 2
`);
  if (outside.status !== 2) {
    throw new Error(`outside-owned-path smoke expected exit 2, got ${outside.status}: ${outside.stderr || outside.stdout}`);
  }

  const overlapValidation = validateWorksets(parseWorksetsYamlFromText(`worksets:
  - id: one
    ownedPaths: [src/]
    dependsOn: []
  - id: two
    ownedPaths: [src/app/]
    dependsOn: []
`));
  if (overlapValidation.ok || !overlapValidation.fallback) {
    throw new Error('owned path overlap should request sequential fallback');
  }
  writeStdoutLine('phase-worktree-coordinator self-test passed');
}

function parseWorksetsYamlFromText(text) {
  const temp = path.join(os.tmpdir(), `worksets-${process.pid}-${Date.now()}.yaml`);
  fs.writeFileSync(temp, text, 'utf8');
  try {
    return parseWorksetsYaml(temp);
  } finally {
    fs.rmSync(temp, { force: true });
  }
}

try {
  const parsed = parseArgs(process.argv.slice(2));
  if (parsed.selfTest) {
    selfTest();
    process.exit(0);
  }
  runCoordinator().then((result) => {
    if (result.reason) {
      writeStdoutLine(`PHASE_WORKTREE_COORDINATOR_REASON=${result.reason}`);
    }
    if (result.artifactPath) {
      writeStdoutLine(`PHASE_WORKTREE_COORDINATOR_ARTIFACT=${result.artifactPath}`);
    }
    process.exit(result.exitCode);
  }).catch((error) => {
    console.error(`ERROR: ${error.message}`);
    process.exit(2);
  });
} catch (error) {
  console.error(`ERROR: ${error.message}`);
  process.exit(2);
}
