import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';

const root = process.cwd();
const fromRoot = (...segments) => path.join(root, ...segments);

test('commit memory refresh resolves sibling support scripts from Moonshot Relay scripts root', async () => {
  const content = await readFile(fromRoot('scripts', 'commit-moonshot-memory-refresh.mjs'), 'utf8');

  assert.match(content, /fileURLToPath\(import\.meta\.url\)/);
  assert.match(content, /SUPPORT_SCRIPT_DIR/);
  assert.match(content, /supportScriptPath\('memorygraph-direct\.mjs'\)/);
  assert.match(content, /supportScriptPath\('memorygraph-project-index\.mjs'\)/);
  assert.doesNotMatch(content, /path\.join\(CLAUDE_ROOT,\s*'scripts',\s*'memorygraph-direct\.mjs'\)/);
  assert.doesNotMatch(content, /path\.join\(CLAUDE_ROOT,\s*'scripts',\s*'memorygraph-project-index\.mjs'\)/);
});

test('commit memory refresh records direct fallback recovery as healthy state', async () => {
  const content = await readFile(fromRoot('scripts', 'commit-moonshot-memory-refresh.mjs'), 'utf8');

  assert.match(content, /recordHealthyCapability/);
  assert.match(content, /hasUnavailableCapability/);
  assert.match(content, /finalStatus === 'direct_fallback_succeeded'/);
  assert.doesNotMatch(content, /if \(!health\.ok \|\| mcp\.status !== 'mcp_ok'\)/);
  assert.doesNotMatch(content, /readUnavailableCapabilities\(PHASE_STATUS_FILE\)\.find/);
});

test('direct MemoryGraph helpers write generated state under .moonshot-state', async () => {
  const direct = await readFile(fromRoot('scripts', 'memorygraph-direct.mjs'), 'utf8');
  const index = await readFile(fromRoot('scripts', 'memorygraph-project-index.mjs'), 'utf8');

  assert.match(direct, /resolveRuntimeStatePath/);
  assert.match(direct, /resolveRuntimeStatePath\('memorygraph'\)/);
  assert.match(direct, /resolveRuntimeStatePath\('cache',\s*'memorygraph'/);
  assert.doesNotMatch(direct, /const DATA_DIR = path\.join\(CLAUDE_ROOT,\s*'memorygraph'\)/);

  assert.match(index, /resolveRuntimeStatePath/);
  assert.match(index, /resolveRuntimeStatePath\('cache',\s*'memorygraph'/);
  assert.doesNotMatch(index, /const DEFAULT_OUTPUT = path\.join\(CLAUDE_ROOT,\s*'cache',\s*'memorygraph'/);
});
