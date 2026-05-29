import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  RECORD_TYPES,
  parseAndValidateJsonl,
  validateKnowledgeRecord,
  validateSupersession,
  validateTransition,
} from './knowledge-records.mjs';

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const SCHEMA_DIR = path.resolve(MODULE_DIR, '../schemas');
const NOW = '2026-05-29T00:00:00Z';

function base(overrides) {
  return {
    id: `${overrides.type}-1`,
    projectId: 'project-a',
    createdAt: NOW,
    updatedAt: NOW,
    supersedes: [],
    ...overrides,
  };
}

function validRecord(type) {
  switch (type) {
    case 'policy_anchor':
      return base({
        type,
        status: 'verified',
        text: 'Always keep project knowledge project-scoped.',
        sourceRef: 'phase-02',
        trustTier: 'authoritative',
        verifiedAt: NOW,
      });
    case 'semantic_fact':
      return base({
        type,
        status: 'verified',
        statement: 'Project knowledge state is scoped by projectId.',
        sourceType: 'authoritative_doc',
        sourceRef: 'master-plan',
        trustTier: 'verified',
        provenanceRef: 'prov-1',
        verifiedBy: 'phase-02-test',
        verifiedAt: NOW,
      });
    case 'episodic_observation':
      return base({
        type,
        status: 'observed',
        summary: 'A transcript mentioned a candidate fact.',
        sourceType: 'transcript',
        sourceRef: 'session-1',
        observedAt: NOW,
        sensitivity: 'internal',
      });
    case 'kg_relation':
      return base({
        type,
        status: 'derived',
        from: 'semantic_fact-1',
        to: 'policy_anchor-1',
        relation: 'supports',
        sourceRef: 'prov-1',
        trustTier: 'derived',
      });
    case 'ontology_constraint':
      return base({
        type,
        status: 'staged',
        scope: 'project-knowledge-plane',
        appliesTo: ['semantic_fact'],
        severity: 'blocking',
        enforcedBy: 'knowledge-records.mjs',
        sourceRef: 'phase-02',
      });
    case 'provenance_event':
      return base({
        type,
        status: 'observed',
        subjectId: 'semantic_fact-1',
        activity: 'validated',
        agent: 'phase-02-test',
        sourceRef: 'knowledge-records.test.mjs',
        sourceType: 'test',
      });
    case 'promotion_candidate':
      return base({
        type,
        status: 'staged',
        targetScope: 'global',
        sourceFactId: 'semantic_fact-1',
        reviewEvidence: 'review-1',
        replayEvidence: 'replay-1',
        denialReason: '',
      });
    default:
      throw new Error(`unsupported fixture type: ${type}`);
  }
}

test('schemas are valid JSON documents with the expected entrypoint metadata', () => {
  const recordSchema = JSON.parse(fs.readFileSync(path.join(SCHEMA_DIR, 'knowledge-record.schema.json'), 'utf8'));
  const provenanceSchema = JSON.parse(fs.readFileSync(path.join(SCHEMA_DIR, 'knowledge-provenance.schema.json'), 'utf8'));

  assert.equal(recordSchema.title, 'Project Knowledge Record');
  assert.equal(recordSchema.oneOf.length, RECORD_TYPES.length);
  assert.equal(provenanceSchema.properties.type.const, 'provenance_event');
});

test('validates all Phase 02 record types', () => {
  for (const type of RECORD_TYPES) {
    const result = validateKnowledgeRecord(validRecord(type));
    assert.equal(result.ok, true, `${type}: ${result.errors.join(', ')}`);
  }
});

test('rejects unknown type, invalid status, invalid trust tier, and missing required fields', () => {
  assert.deepEqual(validateKnowledgeRecord({ type: 'flat_fact' }), {
    ok: false,
    errors: ['unknown type: flat_fact'],
  });

  const badStatus = validateKnowledgeRecord({ ...validRecord('semantic_fact'), status: 'observed' });
  assert.equal(badStatus.ok, false);
  assert.ok(badStatus.errors.includes('invalid semantic_fact status: observed'));

  const badTrust = validateKnowledgeRecord({ ...validRecord('semantic_fact'), trustTier: 'trusted_enough' });
  assert.equal(badTrust.ok, false);
  assert.ok(badTrust.errors.includes('invalid trustTier: trusted_enough'));

  const missing = validRecord('policy_anchor');
  delete missing.sourceRef;
  const missingResult = validateKnowledgeRecord(missing);
  assert.equal(missingResult.ok, false);
  assert.ok(missingResult.errors.includes('missing required field: sourceRef'));

  const invalidSourceType = validateKnowledgeRecord({
    ...validRecord('provenance_event'),
    sourceType: 'clipboard_paste',
  });
  assert.equal(invalidSourceType.ok, false);
  assert.ok(invalidSourceType.errors.includes('invalid sourceType: clipboard_paste'));
});

test('requires sourceType on provenance events across helper and unified schema contract', () => {
  const provenance = validRecord('provenance_event');
  delete provenance.sourceType;

  const validation = validateKnowledgeRecord(provenance);
  assert.equal(validation.ok, false);
  assert.ok(validation.errors.includes('missing required field: sourceType'));

  const recordSchema = JSON.parse(fs.readFileSync(path.join(SCHEMA_DIR, 'knowledge-record.schema.json'), 'utf8'));
  const provenanceVariant = recordSchema.$defs.provenanceEvent.allOf[1];
  assert.ok(provenanceVariant.required.includes('sourceType'));
});

test('rejects raw external semantic promotion without verification evidence', () => {
  const rawSemantic = {
    ...validRecord('semantic_fact'),
    status: 'staged',
    sourceType: 'transcript',
    trustTier: 'quarantined',
    verifiedBy: '',
    verifiedAt: '',
    provenanceRef: '',
  };

  const result = validateKnowledgeRecord(rawSemantic);
  assert.equal(result.ok, false);
  assert.ok(result.errors.includes('raw external semantic_fact requires verifiedBy, verifiedAt, and provenanceRef'));
  assert.ok(result.errors.includes('raw external semantic_fact must be promoted only at verified or authoritative trust'));
});

test('accepts external semantic fact only after verification evidence exists', () => {
  const verified = {
    ...validRecord('semantic_fact'),
    sourceType: 'tool_output',
    trustTier: 'verified',
    verifiedBy: 'reviewer',
    verifiedAt: NOW,
    provenanceRef: 'prov-tool-output-1',
  };

  assert.equal(validateKnowledgeRecord(verified).ok, true);
});

test('parses and validates JSONL with line-scoped errors', () => {
  const text = [
    JSON.stringify(validRecord('semantic_fact')),
    '{not-json}',
    JSON.stringify({ ...validRecord('kg_relation'), status: 'staged' }),
  ].join('\n');

  const result = parseAndValidateJsonl(text, { sourceName: 'fixture.jsonl' });
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.startsWith('fixture.jsonl:2: invalid JSON:')));
  assert.ok(result.errors.includes('fixture.jsonl:3: invalid kg_relation status: staged'));
});

test('parseAndValidateJsonl enforces supersession graph blocks used by the CLI path', () => {
  const cycleText = [
    JSON.stringify({ ...validRecord('semantic_fact'), id: 'a', supersedes: ['b'] }),
    JSON.stringify({ ...validRecord('semantic_fact'), id: 'b', supersedes: ['a'] }),
  ].join('\n');

  const cycleResult = parseAndValidateJsonl(cycleText, { sourceName: 'cycle.jsonl' });
  assert.equal(cycleResult.ok, false);
  assert.ok(cycleResult.errors.includes('cycle.jsonl:1: supersession cycle detected: a -> b -> a'));

  const crossProjectText = [
    JSON.stringify({ ...validRecord('semantic_fact'), id: 'new-fact', projectId: 'project-a', supersedes: ['old-fact'] }),
    JSON.stringify({ ...validRecord('semantic_fact'), id: 'old-fact', projectId: 'project-b', supersedes: [] }),
  ].join('\n');

  const crossProjectResult = parseAndValidateJsonl(crossProjectText, { sourceName: 'cross-project.jsonl' });
  assert.equal(crossProjectResult.ok, false);
  assert.ok(crossProjectResult.errors.includes('cross-project.jsonl:1: cross-project supersession blocked: new-fact (project-a) -> old-fact (project-b)'));
});

test('enforces per-type lifecycle transitions exactly from the phase document', () => {
  assert.equal(validateTransition('semantic_fact', 'staged', 'verified').ok, true);
  assert.equal(validateTransition('semantic_fact', 'verified', 'archived').ok, false);
  assert.equal(validateTransition('promotion_candidate', 'verified', 'promoted').ok, true);
  assert.equal(validateTransition('promotion_candidate', 'promoted', 'archived').ok, false);
});

test('supersession validation blocks cycles', () => {
  const result = validateSupersession([
    { id: 'a', projectId: 'project-a', type: 'semantic_fact', supersedes: ['b'] },
    { id: 'b', projectId: 'project-a', type: 'semantic_fact', supersedes: ['a'] },
  ]);

  assert.equal(result.ok, false);
  assert.deepEqual(result.cycles, [['a', 'b', 'a']]);
});

test('supersession validation blocks cross-project chains by default', () => {
  const result = validateSupersession([
    { id: 'new-fact', projectId: 'project-a', type: 'semantic_fact', supersedes: ['old-fact'] },
    { id: 'old-fact', projectId: 'project-b', type: 'semantic_fact', supersedes: [] },
  ]);

  assert.equal(result.ok, false);
  assert.equal(result.crossProjectViolations.length, 1);
  assert.equal(result.crossProjectViolations[0].supersededProjectId, 'project-b');
});

test('verified global or harness promotion candidates may supersede cross-project records', () => {
  const ok = validateSupersession([
    {
      id: 'promote-core-rule',
      projectId: 'project-a',
      type: 'promotion_candidate',
      status: 'verified',
      targetScope: 'moonshot-harness-core',
      supersedes: ['project-rule'],
    },
    { id: 'project-rule', projectId: 'project-b', type: 'semantic_fact', supersedes: [] },
  ]);

  assert.equal(ok.ok, true);

  const rejected = validateSupersession([
    {
      id: 'unverified-promote',
      projectId: 'project-a',
      type: 'promotion_candidate',
      status: 'staged',
      targetScope: 'global',
      supersedes: ['project-rule'],
    },
    { id: 'project-rule', projectId: 'project-b', type: 'semantic_fact', supersedes: [] },
  ]);

  assert.equal(rejected.ok, false);
  assert.equal(rejected.crossProjectViolations.length, 1);
});
