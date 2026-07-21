import path from 'node:path';
import { mkdir, readFile, writeFile, cp } from 'node:fs/promises';

const forbidden = ['.moonshot-relay', 'runtime-state.sqlite', 'package/claude/profile', 'package/codex/profile', 'package/qwen/profile'];

export const planKernelPackage = async ({ sourceRoot = process.cwd(), outputRoot }) => {
  const manifest = JSON.parse(await readFile(path.join(sourceRoot, 'package', 'kernel', 'manifest.json'), 'utf8'));
  const planned = manifest.include.map((entry) => ({ source: path.join(sourceRoot, entry), target: path.join(outputRoot, entry) }));
  for (const item of planned) {
    const normalized = item.target.replaceAll('\\', '/');
    if (forbidden.some((token) => normalized.includes(token))) throw new Error(`Forbidden Relay surface in Kernel package plan: ${normalized}`);
  }
  return { manifest, planned };
};

export const materializeKernelPackage = async ({ sourceRoot = process.cwd(), outputRoot, dryRun = false }) => {
  const plan = await planKernelPackage({ sourceRoot, outputRoot });
  if (dryRun) return { dryRun: true, ...plan };
  await mkdir(outputRoot, { recursive: true });
  for (const item of plan.planned) {
    try { await cp(item.source, item.target, { recursive: true, force: true }); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  }
  await writeFile(path.join(outputRoot, 'kernel-package-plan.json'), JSON.stringify(plan, null, 2));
  return { dryRun: false, ...plan };
};
