import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';

const root = process.cwd();
const readRoot = (...segments) => readFile(path.join(root, ...segments), 'utf8');
const readJson = async (...segments) => JSON.parse(await readRoot(...segments));

const validMap = () => ({
  schemaVersion: 1,
  artifactId: 'DISCOVERY_MAP',
  destination: 'Prepare a source-backed phase plan',
  lifecycleStatus: 'ticketed',
  notes: ['Use existing Moonshot owners only'],
  decisionsSoFar: [
    {
      id: 'DEC-001',
      summary: 'Keep Discovery Map internal',
      decisionOwner: 'external-skill-pattern-transfer.md',
      evidence: ['docs/public/guidelines/external-skill-pattern-transfer.md'],
    },
  ],
  notYetSpecified: ['Exact implementation file names may change during phase execution'],
  outOfScope: [
    {
      id: 'OOS-001',
      summary: 'No public runtime skill',
      reason: 'Public skill sprawl is rejected',
    },
  ],
  tickets: [
    {
      id: 'T-001',
      title: 'Check source policy',
      type: 'research',
      humanInLoop: false,
      status: 'resolved',
      dependsOn: [],
      question: 'Which existing owner should hold the policy?',
      owner: 'parent-session',
      humanDecisionRequired: false,
      decisionOwner: '',
      factEvidence: ['docs/public/guidelines/external-skill-pattern-transfer.md'],
      acceptedInto: ['PLAN'],
      outOfScopeReason: '',
      linkedEvidence: ['rg policy evidence'],
      resolutionSummary: 'Policy belongs in existing source guideline.',
      graduatedFromFog: 'Policy owner unclear',
    },
    {
      id: 'T-002',
      title: 'Choose public surface',
      type: 'grilling',
      humanInLoop: true,
      status: 'open',
      dependsOn: ['T-001'],
      question: 'Should this become a public skill?',
      owner: 'operator',
      humanDecisionRequired: true,
      decisionOwner: '',
      factEvidence: [],
      acceptedInto: [],
      outOfScopeReason: '',
      linkedEvidence: [],
      resolutionSummary: '',
      graduatedFromFog: '',
    },
  ],
  authorityBoundary: {
    executionAuthority: false,
    fanoutAuthority: false,
    promotionAuthority: false,
    completionAuthority: false,
    runtimeStateAuthority: false,
  },
});

const validateDiscoveryMap = (map, schema) => {
  const findings = [];
  for (const key of schema.required) {
    if (!Object.prototype.hasOwnProperty.call(map, key)) {
      findings.push(`missing ${key}`);
    }
  }
  if (map.schemaVersion !== schema.properties.schemaVersion.const) findings.push('invalid schemaVersion');
  if (map.artifactId !== schema.properties.artifactId.const) findings.push('invalid artifactId');
  if (!schema.properties.lifecycleStatus.enum.includes(map.lifecycleStatus)) findings.push('invalid lifecycleStatus');
  for (const key of Object.keys(schema.properties.authorityBoundary.properties)) {
    if (map.authorityBoundary?.[key] !== false) findings.push(`authorityBoundary.${key} must be false`);
  }

  const ticketSchema = schema.$defs.ticket;
  const ticketIds = new Set((map.tickets || []).map((ticket) => ticket.id));
  const resolvedIds = new Set((map.tickets || []).filter((ticket) => ticket.status === 'resolved').map((ticket) => ticket.id));

  for (const ticket of map.tickets || []) {
    for (const key of ticketSchema.required) {
      if (!Object.prototype.hasOwnProperty.call(ticket, key)) findings.push(`${ticket.id || '<unknown>'} missing ${key}`);
    }
    if (!ticketSchema.properties.type.enum.includes(ticket.type)) findings.push(`${ticket.id} invalid type`);
    if (!ticketSchema.properties.status.enum.includes(ticket.status)) findings.push(`${ticket.id} invalid status`);
    for (const dependency of ticket.dependsOn || []) {
      if (!ticketIds.has(dependency)) findings.push(`${ticket.id} unknown dependency ${dependency}`);
    }
    if (ticket.status === 'resolved' && ticket.humanDecisionRequired && !ticket.decisionOwner) {
      findings.push(`${ticket.id} resolved human decision missing decisionOwner`);
    }
    if ((ticket.acceptedInto || []).length > 0 && ticket.humanDecisionRequired && ticket.status !== 'resolved') {
      findings.push(`${ticket.id} unresolved human decision cannot be promoted`);
    }
  }

  return { findings, resolvedIds };
};

const frontier = (map) => {
  const resolved = new Set(map.tickets.filter((ticket) => ticket.status === 'resolved').map((ticket) => ticket.id));
  return map.tickets
    .filter((ticket) => ticket.status === 'open')
    .filter((ticket) => (ticket.dependsOn || []).every((dependency) => resolved.has(dependency)))
    .map((ticket) => ticket.id);
};

test('discovery map schema is a closed package-safe contract', async () => {
  const schema = await readJson('schemas', 'discovery-map.schema.json');

  assert.equal(schema.$id, 'https://moonshot-relay.local/schemas/discovery-map.schema.json');
  assert.equal(schema.additionalProperties, false);
  assert.deepEqual(schema.properties.authorityBoundary.properties.executionAuthority, { const: false });
  assert.deepEqual(schema.properties.authorityBoundary.properties.fanoutAuthority, { const: false });
  assert.ok(schema.$defs.ticket.properties.type.enum.includes('research'));
  assert.ok(schema.$defs.ticket.properties.type.enum.includes('prototype'));
  assert.ok(schema.$defs.ticket.properties.type.enum.includes('grilling'));
  assert.ok(schema.$defs.ticket.properties.type.enum.includes('task'));
});

test('valid discovery map passes contract validation and exposes advisory frontier', async () => {
  const schema = await readJson('schemas', 'discovery-map.schema.json');
  const map = validMap();

  assert.deepEqual(validateDiscoveryMap(map, schema).findings, []);
  assert.deepEqual(frontier(map), ['T-002']);
});

test('unresolved human decision cannot be promoted', async () => {
  const schema = await readJson('schemas', 'discovery-map.schema.json');
  const map = validMap();
  map.tickets[1].acceptedInto = ['PLAN'];

  assert.ok(validateDiscoveryMap(map, schema).findings.includes('T-002 unresolved human decision cannot be promoted'));
});

test('owner skills reference Discovery Map as internal planning artifact only', async () => {
  const combined = [
    await readRoot('skills', 'product-orchestrator', 'SKILL.md'),
    await readRoot('skills', 'moonshot-plan-writer', 'SKILL.md'),
    await readRoot('docs', 'public', 'guidelines', 'external-skill-pattern-transfer.md'),
  ].join('\n');

  assert.match(combined, /Discovery Map/);
  assert.match(combined, /planning artifact|planning evidence|pre-plan/i);
  assert.match(combined, /agentFanoutContract/);
  assert.match(combined, /not authorize execution|must not authorize execution|not.*fanout authority/i);
});
