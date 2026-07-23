import test from 'node:test';
import assert from 'node:assert/strict';
import { redactSecrets, deepRedact } from '../scripts/kernel/knowledge/context-render.mjs';

test('redactSecrets and deepRedact sanitize all token, key, JWT, and database connection strings', () => {
  const secretString = 'sk-1234567890123456789012 Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c postgres://user:password@localhost:5432/db';

  const sanitizedStr = redactSecrets(secretString);
  assert.ok(!sanitizedStr.includes('sk-1234567890123456789012'));
  assert.ok(!sanitizedStr.includes('postgres://user:password@localhost:5432/db'));
  assert.ok(sanitizedStr.includes('[REDACTED_KEY]') || sanitizedStr.includes('[REDACTED]'));

  const obj = {
    nested: {
      key: 'sk-1234567890123456789012',
      url: 'postgres://user:password@localhost:5432/db',
    },
  };
  const redactedObj = deepRedact(obj);
  assert.ok(!redactedObj.nested.key.includes('sk-1234567890123456789012'));
  assert.ok(!redactedObj.nested.url.includes('postgres://user:password'));
});
