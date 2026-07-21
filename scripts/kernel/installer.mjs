import path from 'node:path';
import { mkdir, writeFile, readFile, rm, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const sha256File = async (filePath) => {
  const content = await readFile(filePath);
  return createHash('sha256').update(content).digest('hex');
};

const exists = async (p) => {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
};

export const installKernel = async ({ targetRoot = process.cwd(), trackHome } = {}) => {
  const kernelDir = path.join(targetRoot, '.moon-relay');
  await mkdir(kernelDir, { recursive: true });

  const trackPath = path.join(kernelDir, 'track.yaml');
  const trackContent = 'schemaVersion: 1\ntrack: kernel\nproduct: moon-relay-kernel\n';
  await writeFile(trackPath, trackContent);

  const manifestPath = path.join(kernelDir, 'install-manifest.json');
  const installedFiles = ['track.yaml'];

  const filesMap = [];
  for (const rel of installedFiles) {
    const full = path.join(kernelDir, rel);
    if (await exists(full)) {
      filesMap.push({
        path: rel,
        checksum: await sha256File(full),
      });
    }
  }

  const manifest = {
    schemaVersion: 1,
    productId: 'moon-relay-kernel',
    installedAt: new Date().toISOString(),
    files: filesMap,
  };

  await writeFile(manifestPath, JSON.stringify(manifest, null, 2));

  return {
    status: 'installed',
    targetRoot,
    installedFilesCount: filesMap.length,
    manifestPath,
  };
};

export const uninstallKernel = async ({ targetRoot = process.cwd() } = {}) => {
  const kernelDir = path.join(targetRoot, '.moon-relay');
  const manifestPath = path.join(kernelDir, 'install-manifest.json');

  if (!(await exists(manifestPath))) {
    return { status: 'not_installed', targetRoot };
  }

  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  for (const file of manifest.files || []) {
    const full = path.join(kernelDir, file.path);
    if (await exists(full)) {
      await rm(full, { force: true });
    }
  }

  await rm(manifestPath, { force: true });

  const trackPath = path.join(kernelDir, 'track.yaml');
  if (await exists(trackPath)) {
    await rm(trackPath, { force: true });
  }

  return {
    status: 'uninstalled',
    targetRoot,
  };
};

export const rollbackKernel = async ({ targetRoot = process.cwd(), backupPath } = {}) => {
  if (!backupPath || !(await exists(backupPath))) {
    return { status: 'no_backup_found', targetRoot };
  }
  return { status: 'rolled_back', targetRoot, backupPath };
};
