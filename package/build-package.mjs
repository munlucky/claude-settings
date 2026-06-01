#!/usr/bin/env node
import assert from 'node:assert/strict';
import { constants as fsConstants } from 'node:fs';
import {
  access,
  chmod,
  copyFile,
  cp,
  mkdir,
  readdir,
  rm,
  stat,
} from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const scriptPath = fileURLToPath(import.meta.url);
const packageRoot = path.dirname(scriptPath);
const repoRoot = path.dirname(packageRoot);

const generatedRoot = packageRoot;

const runtimeSpecs = {
  claude: {
    templateRoot: path.join(packageRoot, 'profile-templates', 'claude', '.claude'),
    outputRoot: path.join('claude', 'profile', '.claude'),
    sharedDirs: [
      'skills',
      'agents',
      'rules',
      'scripts',
      'bin',
      'tools',
      'schemas',
      'templates',
      path.join('docs', 'public'),
    ],
    verificationTarget: 'verification.contract.yaml',
  },
  codex: {
    templateRoot: path.join(packageRoot, 'profile-templates', 'codex', '.codex'),
    outputRoot: path.join('codex', 'profile', '.codex'),
    sharedDirs: [
      'skills',
      'agents',
      'schemas',
      path.join('docs', 'public'),
    ],
    verificationTarget: 'verification.contract.yaml',
  },
};

const denySegments = new Set([
  '.git',
  '.moonshot-state',
  '.code-review-graph',
  'node_modules',
  'fixtures',
  'browser-artifacts',
  'browser-runtime',
  'cache',
  'logs',
  'memorygraph',
  'tmp',
  'traces',
]);

const denyBasenames = [
  /^runtime-state\.sqlite/,
  /^memory\.json$/,
  /^verification-verdict-/,
  /^runtime-verdict-/,
  /^browser-flow-verdict-/,
  /^knowledge-repo-audit-/,
  /\.test\.[cm]?js$/,
  /\.e2e\.test\.[cm]?js$/,
  /_test\.py$/,
  /\.test\.py$/,
];

const denyRelativePaths = new Set([
  'scripts/check-mcp.sh',
  'scripts/harness-surface-inventory.mjs',
  'scripts/verify-phase-closeout-fixtures.mjs',
  'scripts/lib/windows-safe-files.mjs',
  'scripts/lib/phase-attempt-telemetry.mjs',
]);

const usage = () => `Usage: node package/build-package.mjs [--runtime all|claude|codex] [--out <dir>] [--clean] [--dry-run] [--json]`;

const parseArgs = (argv) => {
  const options = {
    runtime: 'all',
    out: generatedRoot,
    clean: false,
    dryRun: false,
    json: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--runtime') {
      options.runtime = argv[++index];
    } else if (arg === '--out') {
      options.out = path.resolve(argv[++index]);
    } else if (arg === '--clean') {
      options.clean = true;
    } else if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--json') {
      options.json = true;
    } else if (arg === '--help' || arg === '-h') {
      console.log(usage());
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}\n${usage()}`);
    }
  }

  if (!['all', 'claude', 'codex'].includes(options.runtime)) {
    throw new Error(`Unsupported runtime: ${options.runtime}\n${usage()}`);
  }

  return options;
};

const pathExists = async (target) => {
  try {
    await access(target, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
};

const toPortable = (filePath) => filePath.split(path.sep).join('/');

const shouldExclude = (sourcePath) => {
  const relative = path.relative(repoRoot, sourcePath);
  const portableRelative = toPortable(relative);
  const segments = relative.split(path.sep);
  const basename = path.basename(sourcePath);

  if (denyRelativePaths.has(portableRelative)) {
    return true;
  }

  if (segments.some((segment) => denySegments.has(segment) || segment.endsWith('fixtures'))) {
    return true;
  }

  return basename.includes('fixtures') || denyBasenames.some((pattern) => pattern.test(basename));
};

const copyTree = async (source, destination, plannedCopies) => {
  if (!await pathExists(source)) {
    throw new Error(`Missing package source: ${path.relative(repoRoot, source)}`);
  }

  await cp(source, destination, {
    recursive: true,
    force: true,
    preserveTimestamps: false,
    filter: (candidate) => {
      const excluded = shouldExclude(candidate);
      if (!excluded && candidate !== source) {
        plannedCopies.push({
          from: toPortable(path.relative(repoRoot, candidate)),
          to: toPortable(path.relative(repoRoot, path.join(destination, path.relative(source, candidate)))),
        });
      }
      return !excluded;
    },
  });
};

const copyFilePreservingMode = async (source, destination, plannedCopies) => {
  await mkdir(path.dirname(destination), { recursive: true });
  await copyFile(source, destination);
  const sourceStat = await stat(source);
  await chmod(destination, sourceStat.mode);
  plannedCopies.push({
    from: toPortable(path.relative(repoRoot, source)),
    to: toPortable(path.relative(repoRoot, destination)),
  });
};

const materializeRuntime = async (runtime, options) => {
  const spec = runtimeSpecs[runtime];
  assert(spec, `Unknown runtime spec: ${runtime}`);

  const outputRoot = path.join(options.out, spec.outputRoot);
  const plannedCopies = [];

  if (options.clean && !options.dryRun) {
    await rm(outputRoot, { recursive: true, force: true });
  }

  if (!options.dryRun) {
    await mkdir(outputRoot, { recursive: true });
  }

  if (options.dryRun) {
    return { runtime, outputRoot, copied: plannedCopies };
  }

  await copyTree(spec.templateRoot, outputRoot, plannedCopies);

  for (const sharedDir of spec.sharedDirs) {
    const source = path.join(repoRoot, sharedDir);
    const targetName = path.basename(sharedDir);
    const destination = sharedDir === path.join('docs', 'public')
      ? path.join(outputRoot, 'docs', 'public')
      : path.join(outputRoot, targetName);
    await copyTree(source, destination, plannedCopies);
  }

  const verificationSource = path.join(repoRoot, 'schemas', 'verification.contract.yaml');
  await copyFilePreservingMode(verificationSource, path.join(outputRoot, spec.verificationTarget), plannedCopies);

  return { runtime, outputRoot, copied: plannedCopies };
};

const main = async () => {
  const options = parseArgs(process.argv.slice(2));
  const runtimes = options.runtime === 'all' ? ['claude', 'codex'] : [options.runtime];
  const results = [];

  for (const runtime of runtimes) {
    results.push(await materializeRuntime(runtime, options));
  }

  if (options.json) {
    console.log(JSON.stringify({
      out: options.out,
      runtimes: results.map((result) => ({
        runtime: result.runtime,
        outputRoot: toPortable(path.relative(repoRoot, result.outputRoot)),
        copiedCount: result.copied.length,
      })),
    }, null, 2));
  } else {
    for (const result of results) {
      console.log(`materialized ${result.runtime}: ${path.relative(repoRoot, result.outputRoot)} (${result.copied.length} entries)`);
    }
  }
};

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
