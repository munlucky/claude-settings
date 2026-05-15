#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const SCHEMA_PATH = path.resolve(MODULE_DIR, '../../schemas/awtl-event-v1.schema.json');

let cachedSchema = null;

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function loadSchemaFile() {
  if (cachedSchema) {
    return cachedSchema;
  }

  const raw = fs.readFileSync(SCHEMA_PATH, 'utf8');
  cachedSchema = JSON.parse(raw);
  return cachedSchema;
}

function isValidDateTime(value) {
  return typeof value === 'string' && value.length > 0 && !Number.isNaN(Date.parse(value));
}

function requiredPayloadFields(eventType) {
  switch (eventType) {
    case 'span_start':
    case 'span_end':
      return ['span_id', 'span_name'];
    case 'action':
      return ['action_name'];
    case 'observation':
      return ['observation_name'];
    case 'judge_result':
      return ['judge_name', 'result'];
    case 'artifact_ref':
      return ['artifact_refs'];
    case 'quarantine':
      return ['quarantine_reason', 'source_path'];
    default:
      return [];
  }
}

function validatePayloadShape(event) {
  const eventType = event.event_type;
  const payload = event.payload;
  const errors = [];

  if (!isPlainObject(payload)) {
    errors.push('payload must be an object');
    return errors;
  }

  for (const field of requiredPayloadFields(eventType)) {
    if (!(field in payload)) {
      errors.push(`payload.${field} is required for ${eventType}`);
    }
  }

  if (eventType === 'judge_result' && typeof payload.result === 'string' && !['pass', 'fail', 'warn'].includes(payload.result)) {
    errors.push('payload.result must be one of pass, fail, or warn');
  }

  if (eventType === 'artifact_ref' && !Array.isArray(payload.artifact_refs)) {
    errors.push('payload.artifact_refs must be an array');
  }

  return errors;
}

export function getAwtlEventSchema() {
  return loadSchemaFile();
}

export function getAwtlEventSchemaPath() {
  return SCHEMA_PATH;
}

export function validateAwtlEvent(event) {
  const schema = loadSchemaFile();
  const errors = [];

  if (!isPlainObject(event)) {
    return { ok: false, errors: ['event must be an object'], schema };
  }

  const requiredFields = schema.required || [];
  for (const field of requiredFields) {
    if (!(field in event)) {
      errors.push(`${field} is required`);
    }
  }

  if (event.schema_version !== 1) {
    errors.push('schema_version must be 1');
  }
  if (typeof event.event_id !== 'string' || event.event_id.length === 0) {
    errors.push('event_id must be a non-empty string');
  }
  if (typeof event.task_id !== 'string' || event.task_id.length === 0) {
    errors.push('task_id must be a non-empty string');
  }
  if (typeof event.session_id !== 'string' || event.session_id.length === 0) {
    errors.push('session_id must be a non-empty string');
  }
  if (typeof event.run_id !== 'string' || event.run_id.length === 0) {
    errors.push('run_id must be a non-empty string');
  }
  if (typeof event.stage !== 'string' || event.stage.length === 0) {
    errors.push('stage must be a non-empty string');
  }
  if (typeof event.actor !== 'string' || event.actor.length === 0) {
    errors.push('actor must be a non-empty string');
  }
  if (typeof event.summary !== 'string') {
    errors.push('summary must be a string');
  }
  if (!isValidDateTime(event.timestamp)) {
    errors.push('timestamp must be an RFC 3339 date-time string');
  }
  if (!Number.isInteger(event.ingest_seq) || event.ingest_seq < 1) {
    errors.push('ingest_seq must be a positive integer');
  }
  if (!Number.isInteger(event.writer_seq) || event.writer_seq < 1) {
    errors.push('writer_seq must be a positive integer');
  }
  if (typeof event.event_type !== 'string' || !Array.isArray(schema.properties.event_type.enum) || !schema.properties.event_type.enum.includes(event.event_type)) {
    errors.push(`event_type must be one of ${schema.properties.event_type.enum.join(', ')}`);
  }

  errors.push(...validatePayloadShape(event));

  return {
    ok: errors.length === 0,
    errors,
    schema,
  };
}

export function assertAwtlEvent(event) {
  const result = validateAwtlEvent(event);
  if (!result.ok) {
    const error = new Error(`Invalid AWTL event: ${result.errors.join('; ')}`);
    error.errors = result.errors;
    throw error;
  }
  return event;
}
