#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

function usage() {
  console.error([
    'Usage:',
    '  harness-prepare-worktree.mjs <task-id> [options]',
    '',
    'Options:',
    '  --worktree-path <path>          Worktree path. Default: .tmp/harness-worktrees/<task-id>',
    '  --branch <name>                 Branch name. Default: codex/<task-id>',
    '  --base <ref>                    Base ref for new branch. Default: HEAD',
    '  --agent-config-source <path>    Source .claude directory. Default: <repo>/.claude',
    '  --hydrate-agent-config          Overlay ignored agent config into the new worktree',
    '  --setup-command <command>       Optional setup command to run after hydration',
    '  --baseline-command <command>    Optional baseline command to run after setup',
  ].join('\n'));
}

function parseArgs(argv) {
  const args = [...argv];
  const options = {
    base: 'HEAD',
    hydrateAgentConfig: false,
  };
  const taskId = args.shift() || '';

  while (args.length > 0) {
    const arg = args.shift();
    switch (arg) {
      case '--worktree-path':
        options.worktreePath = args.shift() || '';
        break;
      case '--branch':
        options.branch = args.shift() || '';
        break;
      case '--base':
        options.base = args.shift() || '';
        break;
      case '--agent-config-source':
        options.agentConfigSource = args.shift() || '';
        break;
      case '--hydrate-agent-config':
        options.hydrateAgentConfig = true;
        break;
      case '--setup-command':
        options.setupCommand = args.shift() || '';
        break;
      case '--baseline-command':
        options.baselineCommand = args.shift() || '';
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

  if (!taskId) {
    throw new Error('task-id is required');
  }

  return { taskId, options };
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

function findRepoRoot() {
  return runRequired('git', ['rev-parse', '--show-toplevel']);
}

function branchExists(repoRoot, branch) {
  const result = run('git', ['rev-parse', '--verify', '--quiet', branch], { cwd: repoRoot });
  return result.status === 0;
}

function isIgnored(repoRoot, relPath) {
  const candidates = [relPath, `${relPath}/`];
  return candidates.some((candidate) => {
    const result = run('git', ['check-ignore', '-q', '--', candidate], { cwd: repoRoot });
    return result.status === 0;
  });
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function removePath(target) {
  fs.rmSync(target, { recursive: true, force: true });
}

function safeSymlinkOrCopy(symlinkSource, copySource, target, type = 'file') {
  removePath(target);
  ensureDir(path.dirname(target));
  try {
    fs.symlinkSync(symlinkSource, target, type === 'dir' ? 'dir' : 'file');
    return 'symlink';
  } catch {
    if (type === 'dir') {
      copyTree(copySource, target, '');
    } else {
      fs.copyFileSync(copySource, target);
    }
    return 'copy';
  }
}

const EXCLUDED_AGENT_PATHS = [
  'logs',
  'cache',
  'browser-runtime',
  'memory.json',
  'memorygraph',
  'verification-results-*',
  'verification-verdict-*',
  'runtime-verdict-*',
  'knowledge-repo-audit-*',
  'tools/browserd/node_modules',
  'tools/browserd/.claude',
];

function wildcardMatch(value, pattern) {
  if (!pattern.includes('*')) {
    return value === pattern || value.startsWith(`${pattern}/`);
  }
  const escaped = pattern
    .split('*')
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*');
  return new RegExp(`^${escaped}$`).test(value);
}

function shouldExcludeAgentPath(relativePath) {
  const normalized = relativePath.split(path.sep).join('/');
  return EXCLUDED_AGENT_PATHS.some((pattern) => wildcardMatch(normalized, pattern));
}

function copyTree(source, target, relativeRoot = '') {
  const stat = fs.statSync(source);
  const rel = relativeRoot.split(path.sep).join('/');

  if (rel && shouldExcludeAgentPath(rel)) {
    return;
  }

  if (stat.isDirectory()) {
    ensureDir(target);
    for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
      const childRel = relativeRoot ? path.join(relativeRoot, entry.name) : entry.name;
      if (shouldExcludeAgentPath(childRel)) {
        continue;
      }
      copyTree(path.join(source, entry.name), path.join(target, entry.name), childRel);
    }
    return;
  }

  if (stat.isFile()) {
    ensureDir(path.dirname(target));
    fs.copyFileSync(source, target);
  }
}

const CLAUDE_COPY_ENTRIES = [
  'CLAUDE.md',
  'CLAUDE.ko.md',
  'verification.contract.yaml',
  'rules',
  'skills',
  'agents',
  'scripts',
  'templates',
  'docs/guidelines',
  'config',
  'schemas',
];

function hydrateClaude(sourceClaude, targetClaude) {
  const hydrated = [];
  for (const entry of CLAUDE_COPY_ENTRIES) {
    const source = path.join(sourceClaude, entry);
    if (!fs.existsSync(source)) {
      continue;
    }
    copyTree(source, path.join(targetClaude, entry), entry);
    hydrated.push(`.claude/${entry}`);
  }
  return hydrated;
}

function hydrateAgentBridge(worktreeRoot, hydratedPaths) {
  const agentsDir = path.join(worktreeRoot, '.agents');
  ensureDir(agentsDir);

  const skillsMode = safeSymlinkOrCopy(
    '../.claude/skills',
    path.join(worktreeRoot, '.claude', 'skills'),
    path.join(agentsDir, 'skills'),
    'dir',
  );
  hydratedPaths.push(`.agents/skills (${skillsMode})`);

  const agentsMd = path.join(worktreeRoot, 'AGENTS.md');
  if (!fs.existsSync(agentsMd)) {
    const mode = safeSymlinkOrCopy(
      '.claude/CLAUDE.md',
      path.join(worktreeRoot, '.claude', 'CLAUDE.md'),
      agentsMd,
      'file',
    );
    hydratedPaths.push(`AGENTS.md (${mode})`);
  } else {
    hydratedPaths.push('AGENTS.md (pre-existing)');
  }
}

function hydrateCodexScaffold(worktreeRoot, hydratedPaths) {
  const codexDir = path.join(worktreeRoot, '.codex');
  ensureDir(codexDir);
  hydratedPaths.push('.codex/ (scaffold only)');
}

function missingRequiredHarnessPaths(worktreeRoot) {
  const required = [
    '.claude/CLAUDE.md',
    '.claude/verification.contract.yaml',
    '.claude/scripts',
    '.claude/skills',
    '.agents/skills',
    'AGENTS.md',
  ];
  return required.filter((rel) => !fs.existsSync(path.join(worktreeRoot, rel)));
}

function runShellCommand(command, cwd, artifactPath) {
  if (!command) {
    return { exitCode: null, artifact: '' };
  }

  const shell = process.platform === 'win32' ? process.env.ComSpec || 'cmd.exe' : process.env.SHELL || '/bin/sh';
  const args = process.platform === 'win32' ? ['/d', '/s', '/c', command] : ['-lc', command];
  const result = run(shell, args, { cwd });
  const output = [
    `$ ${command}`,
    '',
    '--- stdout ---',
    result.stdout || '',
    '--- stderr ---',
    result.stderr || '',
    result.error ? `--- error ---\n${result.error.message}\n` : '',
  ].join('\n');

  ensureDir(path.dirname(artifactPath));
  fs.writeFileSync(artifactPath, output, 'utf8');
  return { exitCode: result.status, artifact: artifactPath };
}

function addWorktree(repoRoot, worktreePath, branch, base) {
  ensureDir(path.dirname(worktreePath));
  const args = branchExists(repoRoot, branch)
    ? ['worktree', 'add', worktreePath, branch]
    : ['worktree', 'add', '-b', branch, worktreePath, base];
  const result = run('git', args, { cwd: repoRoot });
  if (result.status !== 0 || result.error) {
    const detail = result.error?.message || result.stderr || result.stdout || 'git worktree add failed';
    throw new Error(detail.trim());
  }
}

function main() {
  const { taskId, options } = parseArgs(process.argv.slice(2));
  const repoRoot = findRepoRoot();
  const branch = options.branch || `codex/${taskId}`;
  const worktreePath = path.resolve(repoRoot, options.worktreePath || `.tmp/harness-worktrees/${taskId}`);
  const agentConfigSource = path.resolve(repoRoot, options.agentConfigSource || process.env.HARNESS_AGENT_CONFIG_SOURCE || '.claude');

  if (fs.existsSync(worktreePath)) {
    throw new Error(`worktree path already exists: ${worktreePath}`);
  }

  addWorktree(repoRoot, worktreePath, branch, options.base || 'HEAD');

  const ignoredAgentPaths = ['.claude', '.agents', '.codex']
    .filter((rel) => isIgnored(repoRoot, rel));
  const relativeWorktreePath = path.relative(repoRoot, worktreePath);
  const worktreePathIgnored = isIgnored(repoRoot, relativeWorktreePath);
  const hydratedPaths = [];
  const worktreeClaude = path.join(worktreePath, '.claude');
  ensureDir(worktreeClaude);

  if (options.hydrateAgentConfig) {
    if (!fs.existsSync(agentConfigSource) || !fs.statSync(agentConfigSource).isDirectory()) {
      throw new Error(`agent config source is not a directory: ${agentConfigSource}`);
    }
    hydratedPaths.push(...hydrateClaude(agentConfigSource, worktreeClaude));
    hydrateAgentBridge(worktreePath, hydratedPaths);
    hydrateCodexScaffold(worktreePath, hydratedPaths);
  }

  const setupArtifact = path.join(worktreeClaude, 'worktree-setup.log');
  const baselineArtifact = path.join(worktreeClaude, 'worktree-baseline.log');
  const setupResult = runShellCommand(options.setupCommand || '', worktreePath, setupArtifact);
  const baselineResult = runShellCommand(options.baselineCommand || '', worktreePath, baselineArtifact);
  const missingRequiredPaths = options.hydrateAgentConfig ? missingRequiredHarnessPaths(worktreePath) : [];

  const evidence = {
    taskId,
    worktreePath,
    branch,
    base: options.base || 'HEAD',
    worktreePathIgnored,
    agentConfigSource,
    hydrateAgentConfig: options.hydrateAgentConfig,
    ignoredAgentPaths,
    hydratedPaths,
    missingRequiredPaths,
    excludedSensitivePaths: EXCLUDED_AGENT_PATHS.map((entry) => `.claude/${entry}`),
    setupCommand: options.setupCommand || '',
    setupExitCode: setupResult.exitCode,
    setupArtifact: setupResult.artifact ? path.relative(worktreePath, setupResult.artifact) : '',
    baselineCommand: options.baselineCommand || '',
    baselineExitCode: baselineResult.exitCode,
    baselineArtifact: baselineResult.artifact ? path.relative(worktreePath, baselineResult.artifact) : '',
    generatedAt: new Date().toISOString(),
  };

  const evidencePath = path.join(worktreeClaude, 'worktree-prepare.json');
  fs.writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');

  if (missingRequiredPaths.length > 0) {
    console.error(`WORKTREE_PREPARE_PATH=${path.relative(repoRoot, evidencePath)}`);
    console.error(`Missing required harness paths: ${missingRequiredPaths.join(', ')}`);
    process.exit(1);
  }

  if (setupResult.exitCode !== null && setupResult.exitCode !== 0) {
    console.error(`WORKTREE_PREPARE_PATH=${path.relative(repoRoot, evidencePath)}`);
    console.error(`Setup command failed with exit code ${setupResult.exitCode}`);
    process.exit(setupResult.exitCode || 1);
  }

  if (baselineResult.exitCode !== null && baselineResult.exitCode !== 0) {
    console.error(`WORKTREE_PREPARE_PATH=${path.relative(repoRoot, evidencePath)}`);
    console.error(`Baseline command failed with exit code ${baselineResult.exitCode}`);
    process.exit(baselineResult.exitCode || 1);
  }

  if (!worktreePathIgnored) {
    console.error(`WARN: worktree path is not ignored by the source repository: ${relativeWorktreePath}`);
  }

  process.stdout.write(`WORKTREE_PATH=${worktreePath}\n`);
  process.stdout.write(`WORKTREE_BRANCH=${branch}\n`);
  process.stdout.write(`WORKTREE_PREPARE_PATH=${path.relative(repoRoot, evidencePath)}\n`);
}

try {
  main();
} catch (error) {
  console.error(`ERROR: ${error.message}`);
  process.exit(1);
}
