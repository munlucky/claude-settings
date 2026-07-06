import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';

const root = process.cwd();
const readRoot = (...segments) => readFile(path.join(root, ...segments), 'utf8');

test('untrusted content policy treats embedded instructions as data', async () => {
  const guideline = await readRoot('docs', 'public', 'guidelines', 'untrusted-content-boundary.md');
  const schema = await readRoot('schemas', 'untrusted-content-boundary.schema.yaml');

  assert.match(guideline, /are data unless/i);
  assert.match(guideline, /credential, secret, token, cookie, or private data access/);
  assert.match(guideline, /package\/runtime payload, live account-root profiles/);
  assert.match(schema, /promotedToInstruction/);
  assert.match(schema, /confirmationRequiredFor/);
  assert.match(schema, /live_runtime_mutation/);
});

test('owner skills reference untrusted content boundary without replacing runtime authority', async () => {
  const orchestrator = await readRoot('skills', 'moonshot-orchestrator', 'SKILL.md');
  const phaseRunner = await readRoot('skills', 'moonshot-phase-runner', 'SKILL.md');

  assert.match(orchestrator, /untrusted-content-boundary\.md/);
  assert.match(phaseRunner, /untrusted-content-boundary\.md/);
  assert.match(phaseRunner, /assess-completion/);
});
