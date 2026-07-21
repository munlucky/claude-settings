import path from 'node:path';
import { access, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolveKernelRuntimeHome } from './runtime-home.mjs';

const nodeRelativePath = (platform = process.platform) => platform === 'win32' ? 'node.exe' : path.join('bin', 'node');

export const sha256File = async (file) => createHash('sha256').update(await readFile(file)).digest('hex');

export const resolveKernelNode = async ({ runtimeHome = resolveKernelRuntimeHome(), platform = process.platform, fallback = process.execPath } = {}) => {
  const managed = path.join(runtimeHome, 'runtime', 'current', nodeRelativePath(platform));
  try {
    await access(managed);
    return { source: 'managed', nodePath: managed };
  } catch {
    return { source: 'host-fallback', nodePath: fallback };
  }
};

export const buildRuntimeManifest = async ({ runtimeHome, nodePath, platform = process.platform, arch = process.arch }) => ({
  schemaVersion: 1,
  productId: 'moon-relay-kernel',
  runtimeHome,
  platform,
  arch,
  nodePath,
  checksum: await sha256File(nodePath),
});
