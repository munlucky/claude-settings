import path from 'node:path';
import { mkdir, readFile, writeFile, cp, readdir, stat } from 'node:fs/promises';

const forbidden = ['.moonshot-relay', 'runtime-state.sqlite', 'package/claude/profile', 'package/codex/profile', 'package/qwen/profile'];

const mandatoryKernelFiles = [
  'schemas/kernel.track.schema.json',
  'schemas/kernel.runtime-state.schema.json',
  'skills/kernel-minimal-correct-change/SKILL.md',
  'skills/kernel-verification-before-completion/SKILL.md',
];

const exists = async (p) => {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
};

const resolvePattern = async (sourceRoot, entry) => {
  const isWildcard = entry.endsWith('*');
  const cleanEntry = isWildcard ? entry.slice(0, -1) : entry;
  const directPath = path.join(sourceRoot, cleanEntry);

  if (await exists(directPath)) {
    return [cleanEntry];
  }

  const parentDirRel = path.dirname(cleanEntry);
  const prefix = path.basename(cleanEntry);
  const parentDirAbs = path.join(sourceRoot, parentDirRel);

  if (await exists(parentDirAbs)) {
    const entries = await readdir(parentDirAbs, { withFileTypes: true });
    const matches = entries
      .filter((e) => e.name.startsWith(prefix))
      .map((e) => path.join(parentDirRel, e.name).replaceAll('\\', '/'));
    if (matches.length > 0) return matches;
  }

  throw new Error(`Mandatory Kernel include entry resolved to 0 files: ${entry}`);
};

export const planKernelPackage = async ({ sourceRoot = process.cwd(), outputRoot }) => {
  const manifest = JSON.parse(await readFile(path.join(sourceRoot, 'package', 'kernel', 'manifest.json'), 'utf8'));

  const planned = [];
  for (const entry of manifest.include) {
    const resolvedEntries = await resolvePattern(sourceRoot, entry);
    for (const rel of resolvedEntries) {
      planned.push({
        source: path.join(sourceRoot, rel),
        target: path.join(outputRoot, rel),
        rel,
      });
    }
  }

  for (const item of planned) {
    const normalized = item.target.replaceAll('\\', '/');
    if (forbidden.some((token) => normalized.includes(token))) {
      throw new Error(`Forbidden Relay surface in Kernel package plan: ${normalized}`);
    }
  }

  for (const req of mandatoryKernelFiles) {
    const found = planned.some((p) => {
      const normalizedRel = p.rel.replaceAll('\\', '/');
      return normalizedRel === req || req.startsWith(normalizedRel + '/');
    });
    if (!found) {
      throw new Error(`Required kernel file missing from package plan: ${req}`);
    }
  }

  return { manifest, planned };
};

export const materializeKernelPackage = async ({ sourceRoot = process.cwd(), outputRoot, dryRun = false }) => {
  const plan = await planKernelPackage({ sourceRoot, outputRoot });
  if (dryRun) return { dryRun: true, ...plan };
  await mkdir(outputRoot, { recursive: true });

  for (const item of plan.planned) {
    await cp(item.source, item.target, { recursive: true, force: true });
  }

  for (const req of mandatoryKernelFiles) {
    const targetFile = path.join(outputRoot, req);
    if (!(await exists(targetFile))) {
      throw new Error(`Materialization verification failed, required file missing: ${targetFile}`);
    }
  }

  await writeFile(path.join(outputRoot, 'kernel-package-plan.json'), JSON.stringify(plan, null, 2));
  return { dryRun: false, ...plan };
};
