import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readdir, readFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

const root = process.cwd();
const fromRoot = (...segments) => path.join(root, ...segments);

const walk = async (relativeDir) => {
  const absolute = fromRoot(relativeDir);
  if (!existsSync(absolute)) {
    return [];
  }
  const entries = await readdir(absolute, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const relative = path.join(relativeDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await walk(relative));
    } else {
      files.push(relative.replaceAll(path.sep, '/'));
    }
  }
  return files;
};

const activeTextFiles = async () => [
  'README.md',
  ...await walk('docs/public'),
  ...await walk('agents'),
  ...await walk('skills'),
  ...await walk('package/profile-templates'),
].filter((file) => /\.(md|yaml|yml|toml|sh)$/.test(file));

test('active human-facing references do not use missing profile-local guideline source paths', async () => {
  const violations = [];
  for (const file of await activeTextFiles()) {
    const text = await readFile(fromRoot(file), 'utf8');
    text.split(/\r?\n/).forEach((line, index) => {
      if (/\.claude\/docs\/guidelines\//.test(line)) {
        violations.push(`${file}:${index + 1}: ${line.trim()}`);
      }
    });
  }
  assert.deepEqual(violations, []);
});

test('active public guideline references resolve in source', async () => {
  const missing = [];
  const guidelineRef = /docs\/public\/guidelines\/[A-Za-z0-9_.-]+/g;
  for (const file of await activeTextFiles()) {
    const text = await readFile(fromRoot(file), 'utf8');
    for (const match of text.matchAll(guidelineRef)) {
      if (!existsSync(fromRoot(match[0]))) {
        missing.push(`${file}: ${match[0]}`);
      }
    }
  }
  assert.deepEqual(missing, []);
});

test('active memory skills do not present legacy .claude memorygraph cache as the default seed', async () => {
  const violations = [];
  for (const file of [
    'skills/project-memory-refresh/SKILL.md',
    'skills/project-memory-refresh/SKILL.ko.md',
    'skills/commit-moonshot/SKILL.md',
    'skills/commit-moonshot/SKILL.ko.md',
    'skills/doc-auto-sync/SKILL.md',
    'skills/doc-auto-sync/SKILL.ko.md',
  ]) {
    const text = await readFile(fromRoot(file), 'utf8');
    text.split(/\r?\n/).forEach((line, index) => {
      if (/--seed\s+\.claude\/cache\/memorygraph\/project-graph-seed\.json|path:\s*"\.claude\/cache\/memorygraph\/project-graph-seed\.json"/.test(line)) {
        violations.push(`${file}:${index + 1}: ${line.trim()}`);
      }
    });
  }
  assert.deepEqual(violations, []);
});

test('installer docs route WSL/Linux users to the Node installer path', async () => {
  const docs = [
    await readFile(fromRoot('README.md'), 'utf8'),
    await readFile(fromRoot('docs/public/installer-usage.md'), 'utf8'),
    await readFile(fromRoot('docs/public/repository-layout.md'), 'utf8'),
  ].join('\n');

  assert.match(docs, /WSL\/Linux|unsupported shell: Linux/);
  assert.match(docs, /node bin\/moonshot-relay\.mjs install --dry-run --runtime all|node bin\/moonshot-relay\.mjs install --runtime all/);
  assert.match(docs, /Git Bash/);
});

test('active skills and docs do not recommend default archive execution', async () => {
  const violations = [];
  for (const file of await activeTextFiles()) {
    const text = await readFile(fromRoot(file), 'utf8');
    text.split(/\r?\n/).forEach((line, index) => {
      if (/(?:^|\s)(?:bash|node|npm|pnpm|yarn)\s+archive\/scripts\/legacy-phase-adapters\//.test(line)) {
        violations.push(`${file}:${index + 1}: ${line.trim()}`);
      }
    });
  }
  assert.deepEqual(violations, []);
});

test('active skills and docs do not contain personal absolute reference paths', async () => {
  const violations = [];
  for (const file of await activeTextFiles()) {
    const text = await readFile(fromRoot(file), 'utf8');
    if (text.includes('/Users/dev/')) {
      violations.push(file);
    }
  }
  assert.deepEqual(violations, []);
});

test('package dry-run reports planned copy entries', () => {
  const result = spawnSync(process.execPath, [
    'package/build-package.mjs',
    '--runtime',
    'all',
    '--dry-run',
    '--json',
  ], { cwd: root, encoding: 'utf8' });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const payload = JSON.parse(result.stdout);
  for (const runtime of payload.runtimes) {
    assert.ok(Array.isArray(runtime.planned), `${runtime.runtime} should report planned[]`);
    assert.ok(runtime.planned.length > 0, `${runtime.runtime} should report non-empty planned[]`);
    assert.equal(runtime.copiedCount, runtime.planned.length);
  }
});

test('directly executable shell entrypoints use LF line endings', async () => {
  const candidates = [
    ...await walk('bin'),
    ...await walk('scripts'),
    ...await walk('agents'),
    'install-claude.sh',
  ].filter((file) => /\.(sh|bash|zsh)$/.test(file) || file === 'bin/browserctl');
  const violations = [];
  for (const file of candidates) {
    const info = await stat(fromRoot(file));
    if (!info.isFile()) {
      continue;
    }
    const bytes = await readFile(fromRoot(file));
    if (bytes.includes(Buffer.from('\r\n'))) {
      violations.push(file);
    }
  }
  assert.deepEqual(violations, []);
});

test('browser-flow missing runner produces structured setup gap verdict', async () => {
  const result = spawnSync('bash', [
    'agents/verification/verify-runtime.sh',
    '--url=data:text/html,ok',
    '--browser-flow=smoke',
    '--browser-only',
  ], {
    cwd: root,
    encoding: 'utf8',
  });

  assert.equal(result.status, 3, result.stderr || result.stdout);
  const verdictMatch = result.stdout.match(/\.claude\/runtime-verdict-[^\s]+\.json/);
  assert.ok(verdictMatch, result.stdout);
  const verdict = verdictMatch[0];
  const payload = JSON.parse(await readFile(fromRoot(verdict), 'utf8'));
  assert.equal(payload.checks.browserFlowStatus, 'setup_gap');
  assert.equal(payload.checks.browserFlowSetupGapReason, 'browser_flow_runner_unavailable');
  assert.match(payload.checks.browserFlowExpectedRunner, /browser-flow-runner\.mjs$/);
});
