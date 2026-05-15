#!/usr/bin/env node

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  looksSecretLike,
  redactRecord,
  redactText,
  redactValue,
  sha256Hex,
} from './awtl-redaction.mjs';

test('redactText removes secret-like excerpts', () => {
  const secret = 'sk_test_1234567890abcdef1234567890abcdef';
  const input = `token=${secret} next=ok`;
  const result = redactText(input);

  assert.equal(result.mode, 'drop');
  assert.equal(result.reason, 'secret-like');
  assert.ok(!result.value.includes(secret));
  assert.ok(result.value.includes('[redacted]'));
});

test('redactValue fails closed on sensitive fields and supports hashing', () => {
  const secret = 'ghp_abcdefghijklmnopqrstuvwxyz123456';
  const dropped = redactValue(secret, { fieldName: 'apiKey' });
  const hashed = redactValue(secret, { fieldName: 'apiKey', preserveLinkability: true });

  assert.equal(dropped.mode, 'drop');
  assert.equal(dropped.value, '[redacted]');
  assert.equal(hashed.mode, 'hash');
  assert.equal(hashed.value, `[redacted:sha256:${sha256Hex(secret)}]`);
  assert.ok(!hashed.value.includes(secret));
});

test('uncertain values remain closed and record the missing state', () => {
  const result = redactValue(undefined, { fieldName: 'sessionToken' });

  assert.equal(result.mode, 'uncertain');
  assert.equal(result.value, '[redacted:uncertain]');
  assert.equal(result.reason, 'missing-value');
});

test('record redaction keeps safe fields and redacts secrets', () => {
  const record = {
    summary: 'safe text',
    password: 'super-secret-password',
    traceId: 'abc-123',
  };

  const redacted = redactRecord(record);

  assert.equal(redacted.summary, 'safe text');
  assert.equal(redacted.password, '[redacted]');
  assert.equal(redacted.traceId, 'abc-123');
  assert.equal(looksSecretLike('super-secret-password', 'password'), true);
});
