import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { executeTrustedProof } from '../scripts/kernel/proof/proof-executor.mjs';
import { assertNoRawSecret, sanitizePersistentPayload } from '../scripts/kernel/persistent-sanitizer.mjs';

test('persistent payload sanitizer retains secret refs and rejects raw contract secrets', () => {
  const secret = 'sk-proj-12345678901234567890';
  assert.throws(() => assertNoRawSecret({ objective: secret }), /raw_secret_detected/);
  const clean = sanitizePersistentPayload({ secretRefs: ['API_KEY'], authorization: secret, id: '550e8400-e29b-41d4-a716-446655440000' });
  assert.deepEqual(clean.secretRefs, ['API_KEY']);
  assert.equal(clean.authorization, '[REDACTED]');
  assert.equal(clean.id, '550e8400-e29b-41d4-a716-446655440000');
});

test('proof stdout and stderr are redacted before evidence files are written', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'kernel-secret-proof-'));
  const evidenceDir = path.join(root, 'evidence');
  const secret = 'sk-proj-12345678901234567890';
  await writeFile(path.join(root, 'package.json'), JSON.stringify({
    scripts: { 'test:secret': `node -e "console.log('${secret}'); console.error('authorization=Bearer abcdefghijklmnop')" ` },
  }));
  executeTrustedProof({ projectRoot: root, commandRef: 'test:secret', evidenceDir });
  const { readdir } = await import('node:fs/promises');
  const content = (await Promise.all((await readdir(evidenceDir)).map((name) => readFile(path.join(evidenceDir, name), 'utf8')))).join('\n');
  assert.doesNotMatch(content, new RegExp(secret));
  assert.doesNotMatch(content, /abcdefghijklmnop/);
  assert.match(content, /REDACTED/);
});
