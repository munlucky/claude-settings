import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const fromRoot = (...segments) => path.join(root, ...segments);

const requiredTemplates = [
  'ARCHITECTURE_BRIEF.md',
  'REQUIREMENT_INVENTORY.md',
  'ASR_CATALOG.md',
  'QUALITY_ATTRIBUTE_SCENARIOS.md',
  'DOMAIN_MODEL.md',
  'CAPABILITY_MAP.md',
  'ARCHITECTURE_OPTIONS.md',
  'TRADEOFF_ANALYSIS.md',
  'C4_CONTEXT.md',
  'C4_CONTAINER.md',
  'C4_COMPONENT.md',
  'ADR.md',
  'CURRENT_ARCHITECTURE.md',
  'PRD_FIT_GAP.md',
  'IMPACT_MAP.md',
  'SPEC_DELTA.md',
  'TRACEABILITY_MATRIX.md',
];

const requiredTemplateSignals = new Map([
  ['ARCHITECTURE_BRIEF.md', ['# Architecture Brief', '## Success Criteria', 'Verification Signal']],
  ['REQUIREMENT_INVENTORY.md', ['# Requirement Inventory', 'REQ-001', 'Verification Signal']],
  ['ASR_CATALOG.md', ['# Architecturally Significant Requirement Catalog', 'ASR-001', 'QAS-001']],
  ['QUALITY_ATTRIBUTE_SCENARIOS.md', ['# Quality Attribute Scenarios', 'QAS-001', 'Response Measure']],
  ['DOMAIN_MODEL.md', ['# Domain Model', '## Ubiquitous Language', '## Boundary Decisions']],
  ['CAPABILITY_MAP.md', ['# Capability Map', 'CAP-001', 'Requirement IDs']],
  ['ARCHITECTURE_OPTIONS.md', ['# Architecture Options', 'OPT-001', 'Verification Signal']],
  ['TRADEOFF_ANALYSIS.md', ['# Tradeoff Analysis', '## Decision Drivers', 'Rejected alternatives']],
  ['C4_CONTEXT.md', ['# C4 Context', 'C4/C4_CONTEXT.md', '## System Boundary', 'mermaid']],
  ['C4_CONTAINER.md', ['# C4 Container', 'C4/C4_CONTAINER.md', '## Containers', 'mermaid']],
  ['C4_COMPONENT.md', ['# C4 Component', 'C4/C4_COMPONENT.md', '## Components', 'Verification Signal']],
  ['ADR.md', ['# ADR-0001', 'ADR/ADR-0001-title.md', '## Decision', '## Rejected Alternatives']],
  ['CURRENT_ARCHITECTURE.md', ['# Current Architecture', '## Evidence Summary', '## Owned Paths']],
  ['PRD_FIT_GAP.md', ['# PRD Fit Gap', 'REQ-001', 'Product Risk']],
  ['IMPACT_MAP.md', ['# Impact Map', 'Compatibility Impact', 'Verification Signal']],
  ['SPEC_DELTA.md', ['# Spec Delta', 'Compatibility', 'Rollback']],
  ['TRACEABILITY_MATRIX.md', ['# Traceability Matrix', 'REQ-001', 'ADR-0001']],
]);

test('architecture template inventory is complete', async () => {
  const templateDir = fromRoot('templates', 'architecture');
  const entries = await readdir(templateDir);

  assert.deepEqual(entries.sort(), requiredTemplates.sort());
});

test('architecture templates carry stable validation signals', async () => {
  for (const template of requiredTemplates) {
    const fullPath = fromRoot('templates', 'architecture', template);
    assert.equal(existsSync(fullPath), true, `${template} should exist`);

    const content = await readFile(fullPath, 'utf8');
    assert.match(content, /^---\r?\n/, `${template} should carry front matter metadata`);
    assert.match(content, /artifactId:/, `${template} should declare artifactId`);
    assert.match(content, /owner:/, `${template} should declare owner`);

    for (const signal of requiredTemplateSignals.get(template)) {
      assert.ok(content.includes(signal), `${template} should include signal: ${signal}`);
    }
  }
});
