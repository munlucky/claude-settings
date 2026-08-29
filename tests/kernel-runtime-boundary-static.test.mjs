import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const collectFiles = async (dir, ext = '.mjs') => {
  const result = [];
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      result.push(...await collectFiles(fullPath, ext));
    } else if (entry.isFile() && (ext ? fullPath.endsWith(ext) : true)) {
      result.push(fullPath);
    }
  }
  return result;
};

test('Static boundary: No production file imports deleted legacy launchers', async () => {
  const productionDirs = [
    path.resolve('scripts/kernel'),
    path.resolve('scripts/switcher'),
    path.resolve('scripts/host'),
    path.resolve('bin'),
  ];
  const forbiddenPatterns = [
    /codex-cli-launcher/i,
    /codex-runtime/i,
    /codex-profile-materializer/i,
    /codex-review-host/i,
    /moon-relay-kernel-host/i,
  ];

  for (const dir of productionDirs) {
    const files = await collectFiles(dir);
    for (const file of files) {
      const content = await readFile(file, 'utf8');
      for (const pattern of forbiddenPatterns) {
        assert.equal(
          pattern.test(content),
          false,
          `Forbidden legacy launcher reference matched in production file ${file}: ${pattern}`,
        );
      }
    }
  }
});

test('Static boundary: No production file contains forbidden legacy vocabulary strings', async () => {
  const productionDirs = [
    path.resolve('scripts/kernel'),
    path.resolve('scripts/switcher'),
    path.resolve('scripts/host'),
    path.resolve('bin'),
  ];
  const forbiddenStrings = [
    'relaunch-through-kernel-host',
    'shared-host-dispatch',
    'profile-and-data-root',
  ];

  for (const dir of productionDirs) {
    const files = await collectFiles(dir);
    for (const file of files) {
      const content = await readFile(file, 'utf8');
      for (const str of forbiddenStrings) {
        assert.equal(
          content.includes(str),
          false,
          `Forbidden legacy string '${str}' found in production file ${file}`,
        );
      }
    }
  }
});
