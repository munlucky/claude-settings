#!/usr/bin/env node

import { createHash } from 'node:crypto';

const SENSITIVE_FIELD_PATTERNS = [
  /password/i,
  /secret/i,
  /token/i,
  /bearer/i,
  /cookie/i,
  /session/i,
  /authorization/i,
  /api[_-]?key/i,
];

const SECRET_VALUE_PATTERNS = [
  /gh[pousr]_[A-Za-z0-9_]{20,}/g,
  /sk_(?:live|test)_[A-Za-z0-9_]{16,}/g,
  /xox[baprs]-[A-Za-z0-9-]{10,}/g,
  /(?:AKIA|ASIA)[0-9A-Z]{16}/g,
  /Bearer\s+[A-Za-z0-9\-._~+/=]{16,}/gi,
];

function normalizeText(value) {
  return String(value ?? '').trim();
}

function normalizeFieldName(fieldName = '') {
  return normalizeText(fieldName).toLowerCase();
}

export function sha256Hex(value) {
  return createHash('sha256').update(String(value ?? ''), 'utf8').digest('hex');
}

export function looksSecretLike(value, fieldName = '') {
  const text = normalizeText(value);
  const normalizedField = normalizeFieldName(fieldName);

  if (!text) {
    return false;
  }

  if (SENSITIVE_FIELD_PATTERNS.some((pattern) => pattern.test(normalizedField))) {
    return true;
  }

  return SECRET_VALUE_PATTERNS.some((pattern) => {
    pattern.lastIndex = 0;
    return pattern.test(text);
  });
}

export function redactValue(value, options = {}) {
  const fieldName = normalizeFieldName(options.fieldName);
  if (value === undefined || value === null) {
    return {
      mode: 'uncertain',
      value: '[redacted:uncertain]',
      reason: 'missing-value',
      fieldName,
    };
  }

  const text = String(value);
  if (looksSecretLike(text, fieldName)) {
    if (options.preserveLinkability === true) {
      return {
        mode: 'hash',
        value: `[redacted:sha256:${sha256Hex(text)}]`,
        reason: 'secret-like',
        fieldName,
      };
    }

    return {
      mode: 'drop',
      value: '[redacted]',
      reason: 'secret-like',
      fieldName,
    };
  }

  return {
    mode: 'allow',
    value: text,
    reason: 'safe',
    fieldName,
  };
}

export function redactText(text, options = {}) {
  const source = String(text ?? '');
  if (!source) {
    return {
      mode: 'uncertain',
      value: '[redacted:uncertain]',
      reason: 'missing-text',
    };
  }

  let mode = 'allow';
  let redacted = source;
  for (const pattern of SECRET_VALUE_PATTERNS) {
    pattern.lastIndex = 0;
    redacted = redacted.replace(pattern, (match) => {
      mode = options.preserveLinkability === true ? 'hash' : 'drop';
      return options.preserveLinkability === true
        ? `[redacted:sha256:${sha256Hex(match)}]`
        : '[redacted]';
    });
  }

  return {
    mode,
    value: redacted,
    reason: mode === 'allow' ? 'safe' : 'secret-like',
  };
}

export function redactRecord(record = {}, options = {}) {
  const result = {};
  for (const [key, value] of Object.entries(record || {})) {
    result[key] = redactValue(value, { ...options, fieldName: key }).value;
  }
  return result;
}
