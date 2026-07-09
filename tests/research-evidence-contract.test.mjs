import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';

const root = process.cwd();
const readRoot = (...segments) => readFile(path.join(root, ...segments), 'utf8');

const forbiddenRawPayloadTerms = [
  /raw MemoryGraph records/i,
  /raw runtime logs/i,
  /long transcripts/i,
  /secrets/i,
  /external prompt bodies/i,
];

test('research evidence policy requires source quality recency and limits', async () => {
  const policy = await readRoot('docs', 'public', 'guidelines', 'research-evidence-policy.md');
  const template = await readRoot('templates', 'product-definition', 'RESEARCH_NOTE.template.md');

  for (const expected of ['source quality', 'recency', 'confidence', 'limitations', 'conflicts', 'freshness rule']) {
    assert.match(`${policy}\n${template}`, new RegExp(expected, 'i'));
  }
  assert.match(template, /Linked Decisions Or Requirements/);
});

test('prototype decision template requires disposition and non-production boundary', async () => {
  const template = await readRoot('templates', 'product-definition', 'PROTOTYPE_DECISION.template.md');

  assert.match(template, /prototypeType: "logic \| state \| ui \| integration"/);
  assert.match(template, /acceptedDecision/);
  assert.match(template, /delete/);
  assert.match(template, /absorb/);
  assert.match(template, /retain_as_nonproduction_evidence/);
  assert.match(template, /not production payload by default/i);
});

test('artifact routing forbids raw private and runtime payloads in evidence notes', async () => {
  const combined = [
    await readRoot('docs', 'public', 'guidelines', 'artifact-routing-policy.md'),
    await readRoot('schemas', 'artifact-routing.schema.yaml'),
    await readRoot('templates', 'product-definition', 'RESEARCH_NOTE.template.md'),
    await readRoot('templates', 'product-definition', 'PROTOTYPE_DECISION.template.md'),
  ].join('\n');

  for (const forbidden of forbiddenRawPayloadTerms) {
    assert.match(combined, forbidden);
  }
  assert.match(combined, /compact summaries and pointers/i);
});
