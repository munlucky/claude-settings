#!/usr/bin/env node
import { access, readFile } from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import {
  assertRuntimeSurfaceUnexpanded,
  auditSkillsLock,
} from './lib/skills-lock.mjs';

const usage = () => 'Usage: node scripts/doctor.mjs check [--repo-root <root>] [--lock <skills-lock.json>] [--runtime-surface <runtime-surface.json>] [--expected-runtime-surface-json <json-array>] [--json]';

const parseArgs = (argv) => {
  const options = { command: argv[0] || '', json: false };
  for (let index = 1; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--repo-root') options.repoRoot = argv[++index] || '';
    else if (arg === '--lock') options.lock = argv[++index] || '';
    else if (arg === '--runtime-surface') options.runtimeSurface = argv[++index] || '';
    else if (arg === '--expected-runtime-surface-json') options.expectedRuntimeSurfaceJson = argv[++index] || '';
    else if (arg === '--json') options.json = true;
    else if (arg === '--help' || arg === '-h') options.help = true;
    else throw new Error(`Unknown argument: ${arg}\n${usage()}`);
  }
  return options;
};

const resolveFromRoot = (repoRoot, file) => (path.isAbsolute(file) ? file : path.join(repoRoot, file));

const readJson = async (file) => JSON.parse(await readFile(file, 'utf8'));

const pathExists = async (file) => {
  try {
    await access(file, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
};

const main = async () => {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }
  if (args.command !== 'check') throw new Error(`Unknown command: ${args.command}\n${usage()}`);

  const repoRoot = path.resolve(args.repoRoot || process.cwd());
  const runtimeSurfacePath = args.runtimeSurface
    ? resolveFromRoot(repoRoot, args.runtimeSurface)
    : path.join(repoRoot, 'package', 'runtime-surface.json');
  const runtimeSurface = await readJson(runtimeSurfacePath);
  const expectedRuntimeSurface = args.expectedRuntimeSurfaceJson
    ? JSON.parse(args.expectedRuntimeSurfaceJson)
    : runtimeSurface.publicRuntimeSkills;
  const findings = [];
  try {
    assertRuntimeSurfaceUnexpanded({
      before: expectedRuntimeSurface,
      after: runtimeSurface.publicRuntimeSkills || [],
    });
  } catch (error) {
    findings.push({
      type: 'runtime_surface_expanded',
      severity: 'blocking',
      reason: error instanceof Error ? error.message : String(error),
    });
  }

  const defaultLockPath = path.join(repoRoot, 'skills.lock.json');
  const lock = args.lock
    ? await readJson(resolveFromRoot(repoRoot, args.lock))
    : await pathExists(defaultLockPath)
      ? await readJson(defaultLockPath)
      : null;
  const skills = await auditSkillsLock({ repoRoot, lock, runtimeSurface });
  findings.push(...skills.findings);

  const result = {
    status: findings.some((finding) => finding.severity === 'blocking') ? 'blocked' : findings.length ? 'review_required' : 'pass',
    checks: {
      runtimeSettings: args.repoRoot ? 'explicit_repo_root' : 'source_checkout',
      repoRoot,
      lockPath: args.lock ? resolveFromRoot(repoRoot, args.lock) : defaultLockPath,
      runtimeSurfacePath,
      gitState: 'caller_owned',
      schemaVersions: [1],
      packageDrift: 'runtime_surface_guarded',
    },
    findings,
  };

  if (args.json) console.log(JSON.stringify(result, null, 2));
  else console.log(result.status);
  if (result.status === 'blocked') process.exitCode = 2;
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
