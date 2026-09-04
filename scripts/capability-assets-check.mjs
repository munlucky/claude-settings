#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const assetRoot = path.join(root, 'docs', 'capability-assets');
const schemaPath = path.join(assetRoot, 'asset.schema.json');
const catalogPath = path.join(assetRoot, 'catalog.yaml');
const taxonomyPath = path.join(assetRoot, 'taxonomy.yaml');
const epochsPath = path.join(assetRoot, 'epochs.yaml');
const inventoryPath = path.join(assetRoot, 'inventory-current.yaml');
const errors = [];
const warnings = [];

function addError(message) {
  errors.push(message);
}

function readText(filePath, label) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch (error) {
    addError(label + ': ' + error.message);
    return '';
  }
}

function readJson(filePath, label) {
  const text = readText(filePath, label);
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch (error) {
    addError(label + ' is not JSON-compatible YAML: ' + error.message);
    return null;
  }
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isText(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function isTextArray(value) {
  return Array.isArray(value) && value.every(isText);
}

function requireObject(value, label) {
  if (!isObject(value)) addError(label + ' must be an object');
  return isObject(value);
}

function requireText(value, label) {
  if (!isText(value)) addError(label + ' must be a non-empty string');
}

function requireTextArray(value, label, allowEmpty = true) {
  if (!Array.isArray(value) || !value.every(isText) || (!allowEmpty && value.length === 0)) {
    addError(label + ' must be a ' + (allowEmpty ? '' : 'non-empty ') + 'string array');
  }
}

function exactKeys(value, keys, label) {
  if (!isObject(value)) return;
  const expected = new Set(keys);
  for (const key of Object.keys(value)) {
    if (!expected.has(key)) addError(label + ' has unexpected key ' + key);
  }
  for (const key of keys) {
    if (!(key in value)) addError(label + ' is missing ' + key);
  }
}

function safeRelativePath(value, label) {
  if (!isText(value) || path.posix.isAbsolute(value) || path.win32.isAbsolute(value) || value.includes('..') || /[\r\n]/.test(value)) {
    addError(label + ' must be a safe relative path');
    return false;
  }
  return true;
}

function git(args) {
  return spawnSync('git', args, { cwd: root, encoding: 'utf8', windowsHide: true });
}

function commitExists(commit, label) {
  if (!/^[0-9a-f]{40}$/.test(commit)) {
    addError(label + ' must be a full 40-character lowercase Git SHA');
    return false;
  }
  const result = git(['cat-file', '-e', commit + '^{commit}']);
  if (result.status !== 0) {
    addError(label + ' does not resolve to a commit: ' + commit);
    return false;
  }
  return true;
}

function pathAtCommit(commit, relativePath, label) {
  if (!commitExists(commit, label + ' commit') || !safeRelativePath(relativePath, label + ' path')) return;
  const result = git(['cat-file', '-e', commit + ':' + relativePath]);
  if (result.status !== 0) addError(label + ' is absent at ' + commit + ': ' + relativePath);
}

function checkProofItem(item, label) {
  requireObject(item, label);
  if (!isObject(item)) return;
  requireText(item.id, label + '.id');
  requireText(item.path, label + '.path');
  requireText(item.purpose, label + '.purpose');
  safeRelativePath(item.path, label + '.path');
  if (item.commandRef !== undefined && item.commandRef !== null) requireText(item.commandRef, label + '.commandRef');
  if (item.status !== undefined && !['verified', 'partial', 'missing', 'historical', 'unknown'].includes(item.status)) {
    addError(label + '.status is not a supported proof status');
  }
  if (isText(item.path) && !fs.existsSync(path.join(root, item.path))) {
    addError(label + ' path does not exist in the current checkout: ' + item.path);
  }
}

function checkManifest(manifest, manifestPath, schema, epochCommits, allIds) {
  const label = manifestPath.replace(root + path.sep, '').replaceAll(path.sep, '/');
  if (!isObject(manifest)) return;
  const required = Array.isArray(schema?.required) ? schema.required : [];
  const allowed = Object.keys(schema?.properties || {});
  exactKeys(manifest, allowed, label);
  for (const key of required) {
    if (!(key in manifest)) addError(label + ' is missing required field ' + key);
  }

  requireText(manifest.id, label + '.id');
  const directoryId = path.basename(path.dirname(manifestPath));
  if (manifest.id !== directoryId) addError(label + '.id must match directory ' + directoryId);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(manifest.id || '')) addError(label + '.id is not kebab-case');
  if (manifest.schemaVersion !== 1) addError(label + '.schemaVersion must be 1');
  requireText(manifest.name, label + '.name');
  requireText(manifest.summary, label + '.summary');
  if (!['WORK', 'TRUST', 'KNOWLEDGE', 'EXECUTION', 'INTELLIGENCE', 'OPTIMIZATION', 'PRODUCTIVITY'].includes(manifest.category)) {
    addError(label + '.category is invalid');
  }
  if (!['CORE', 'HOST', 'OPTIONAL', 'LIBRARY', 'REFERENCE', 'DEPRECATED', 'EXPERIMENTAL'].includes(manifest.status)) {
    addError(label + '.status is invalid');
  }

  const relevance = manifest.product_relevance;
  requireObject(relevance, label + '.product_relevance');
  if (isObject(relevance)) {
    exactKeys(relevance, ['relevant', 'reason', 'consumers'], label + '.product_relevance');
    if (typeof relevance.relevant !== 'boolean') addError(label + '.product_relevance.relevant must be boolean');
    requireText(relevance.reason, label + '.product_relevance.reason');
    requireTextArray(relevance.consumers, label + '.product_relevance.consumers', false);
  }

  const origin = manifest.origin;
  requireObject(origin, label + '.origin');
  if (isObject(origin)) {
    exactKeys(origin, ['first_seen', 'generations'], label + '.origin');
    const firstSeen = origin.first_seen;
    requireObject(firstSeen, label + '.origin.first_seen');
    if (isObject(firstSeen)) {
      exactKeys(firstSeen, ['epoch', 'commit', 'date', 'evidence'], label + '.origin.first_seen');
      if (!/^E[0-8]$/.test(firstSeen.epoch || '')) addError(label + '.origin.first_seen.epoch is invalid');
      if (commitExists(firstSeen.commit, label + '.origin.first_seen')) {
        if (!epochCommits.has(firstSeen.commit)) addError(label + '.origin.first_seen.commit is not listed in epochs.yaml');
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(firstSeen.date || '')) addError(label + '.origin.first_seen.date must be YYYY-MM-DD');
      requireTextArray(firstSeen.evidence, label + '.origin.first_seen.evidence', false);
    }
    if (!Array.isArray(origin.generations) || origin.generations.length === 0) {
      addError(label + '.origin.generations must be non-empty');
    } else {
      origin.generations.forEach((generation, index) => {
        const generationLabel = label + '.origin.generations[' + index + ']';
        requireObject(generation, generationLabel);
        if (!isObject(generation)) return;
        exactKeys(generation, ['id', 'epoch', 'commit', 'label', 'change'], generationLabel);
        requireText(generation.id, generationLabel + '.id');
        if (!/^E[0-8]$/.test(generation.epoch || '')) addError(generationLabel + '.epoch is invalid');
        if (commitExists(generation.commit, generationLabel)) {
          if (!epochCommits.has(generation.commit)) addError(generationLabel + '.commit is not listed in epochs.yaml');
        }
        requireText(generation.label, generationLabel + '.label');
        requireText(generation.change, generationLabel + '.change');
      });
    }
  }

  for (const section of ['problem', 'authority', 'contracts']) {
    const value = manifest[section];
    requireObject(value, label + '.' + section);
    if (isObject(value)) {
      const keys = section === 'problem'
        ? ['solves', 'does_not_solve']
        : section === 'authority'
          ? ['owns_state', 'owns_completion', 'provides_evidence']
          : ['inputs', 'outputs', 'invariants', 'guardrails'];
      exactKeys(value, keys, label + '.' + section);
      for (const key of keys) requireTextArray(value[key], label + '.' + section + '.' + key, false);
    }
  }
  requireTextArray(manifest.recommended_use, label + '.recommended_use', false);
  requireTextArray(manifest.avoid_use, label + '.avoid_use', false);

  const implementations = manifest.implementations;
  requireObject(implementations, label + '.implementations');
  if (isObject(implementations)) {
    exactKeys(implementations, ['best_known', 'historical'], label + '.implementations');
    for (const [kind, entries] of [['best_known', [implementations.best_known]], ['historical', implementations.historical || []]]) {
      if (!Array.isArray(entries) || (kind === 'historical' && entries.length === 0)) {
        addError(label + '.implementations.' + kind + ' must be present');
        continue;
      }
      entries.forEach((implementation, index) => {
        const implementationLabel = label + '.implementations.' + kind + '[' + index + ']';
        requireObject(implementation, implementationLabel);
        if (!isObject(implementation)) return;
        exactKeys(implementation, ['commit', 'paths', 'generation', 'notes'], implementationLabel);
        if (implementation.commit !== null) {
          commitExists(implementation.commit, implementationLabel);
          if (implementation.commit && implementation.commit.length === 40) {
            for (const implementationPath of implementation.paths || []) pathAtCommit(implementation.commit, implementationPath, implementationLabel);
          }
        }
        requireTextArray(implementation.paths, implementationLabel + '.paths', false);
        (implementation.paths || []).forEach((implementationPath, pathIndex) => safeRelativePath(implementationPath, implementationLabel + '.paths[' + pathIndex + ']'));
        requireText(implementation.generation, implementationLabel + '.generation');
        requireText(implementation.notes, implementationLabel + '.notes');
      });
    }
  }

  const proof = manifest.proof;
  requireObject(proof, label + '.proof');
  if (isObject(proof)) {
    exactKeys(proof, ['tests', 'fixtures', 'smoke'], label + '.proof');
    for (const key of ['tests', 'fixtures', 'smoke']) {
      if (!Array.isArray(proof[key])) addError(label + '.proof.' + key + ' must be an array');
      else proof[key].forEach((item, index) => checkProofItem(item, label + '.proof.' + key + '[' + index + ']'));
    }
    if (!Array.isArray(proof.tests) || proof.tests.length === 0) addError(label + '.proof.tests must be non-empty');
  }

  if (!Array.isArray(manifest.known_failures) || manifest.known_failures.length === 0) {
    addError(label + '.known_failures must be non-empty');
  } else {
    manifest.known_failures.forEach((failure, index) => {
      const failureLabel = label + '.known_failures[' + index + ']';
      requireObject(failure, failureLabel);
      if (!isObject(failure)) return;
      for (const key of ['id', 'severity', 'symptom', 'root_cause', 'lesson']) requireText(failure[key], failureLabel + '.' + key);
      if (!['P0', 'P1', 'P2', 'P3', 'unknown'].includes(failure.severity)) addError(failureLabel + '.severity is invalid');
      if (failure.fixed_in !== undefined && failure.fixed_in !== null) requireText(failure.fixed_in, failureLabel + '.fixed_in');
      if (failure.regression_tests !== undefined) requireTextArray(failure.regression_tests, failureLabel + '.regression_tests');
    });
  }

  const dependencies = manifest.dependencies;
  requireObject(dependencies, label + '.dependencies');
  if (isObject(dependencies)) {
    exactKeys(dependencies, ['capabilities', 'runtime', 'external'], label + '.dependencies');
    if (!Array.isArray(dependencies.capabilities)) addError(label + '.dependencies.capabilities must be an array');
    else {
      for (const dependency of dependencies.capabilities) {
        if (!allIds.has(dependency)) addError(label + ' depends on missing asset ' + dependency);
        if (dependency === manifest.id) addError(label + ' cannot depend on itself');
      }
    }
    requireTextArray(dependencies.runtime, label + '.dependencies.runtime');
    requireTextArray(dependencies.external, label + '.dependencies.external');
  }

  const integration = manifest.current_integration;
  requireObject(integration, label + '.current_integration');
  if (isObject(integration)) {
    exactKeys(integration, ['layer', 'active', 'notes', 'paths', 'entrypoints'], label + '.current_integration');
    requireText(integration.layer, label + '.current_integration.layer');
    if (typeof integration.active !== 'boolean') addError(label + '.current_integration.active must be boolean');
    requireText(integration.notes, label + '.current_integration.notes');
    requireTextArray(integration.paths, label + '.current_integration.paths', false);
    requireTextArray(integration.entrypoints, label + '.current_integration.entrypoints');
    (integration.paths || []).forEach((integrationPath, index) => {
      safeRelativePath(integrationPath, label + '.current_integration.paths[' + index + ']');
      if (isText(integrationPath) && !fs.existsSync(path.join(root, integrationPath))) {
        addError(label + '.current_integration path missing: ' + integrationPath);
      }
    });
    if (manifest.status === 'DEPRECATED' && integration.active !== false) addError(label + ' DEPRECATED asset must be inactive');
  }

  const reintroduction = manifest.reintroduction;
  requireObject(reintroduction, label + '.reintroduction');
  if (isObject(reintroduction)) {
    exactKeys(reintroduction, ['recommended_layer', 'trigger', 'integration_points', 'risks', 'guardrails'], label + '.reintroduction');
    requireText(reintroduction.recommended_layer, label + '.reintroduction.recommended_layer');
    requireText(reintroduction.trigger, label + '.reintroduction.trigger');
    requireTextArray(reintroduction.integration_points, label + '.reintroduction.integration_points', false);
    requireTextArray(reintroduction.risks, label + '.reintroduction.risks', false);
    requireTextArray(reintroduction.guardrails, label + '.reintroduction.guardrails', false);
  }

  const decision = manifest.decision;
  requireObject(decision, label + '.decision');
  if (isObject(decision)) {
    exactKeys(decision, ['disposition', 'rationale', 'follow_up'], label + '.decision');
    if (!['retain', 'reintroduce', 'archive', 'replace', 'forbid', 'unknown'].includes(decision.disposition)) {
      addError(label + '.decision.disposition is invalid');
    }
    requireText(decision.rationale, label + '.decision.rationale');
    requireTextArray(decision.follow_up, label + '.decision.follow_up');
    if (manifest.status === 'DEPRECATED' && !['archive', 'forbid'].includes(decision.disposition)) {
      addError(label + ' DEPRECATED asset must have archive or forbid disposition');
    }
  }
}

const schema = readJson(schemaPath, 'asset.schema.json') || {};
const catalog = readJson(catalogPath, 'catalog.yaml') || {};
const taxonomy = readText(taxonomyPath, 'taxonomy.yaml');
const epochs = readText(epochsPath, 'epochs.yaml');
const inventory = readText(inventoryPath, 'inventory-current.yaml');

if (!taxonomy.includes('schemaVersion: 1')) addError('taxonomy.yaml must declare schemaVersion 1');
for (const domain of ['WORK', 'TRUST', 'KNOWLEDGE', 'EXECUTION', 'INTELLIGENCE', 'OPTIMIZATION', 'PRODUCTIVITY']) {
  if (!taxonomy.includes(domain + ':')) addError('taxonomy.yaml is missing domain ' + domain);
}
for (const status of ['CORE', 'HOST', 'OPTIONAL', 'LIBRARY', 'REFERENCE', 'DEPRECATED', 'EXPERIMENTAL']) {
  if (!taxonomy.includes(status + ':')) addError('taxonomy.yaml is missing status ' + status);
}

const epochCommits = new Set((epochs.match(/[0-9a-f]{40}/g) || []));
if (!epochCommits.has('9701a86d2225c938f13982a7e0f7f43a7f9bc10e')) addError('epochs.yaml is missing the baseline commit');
for (const commit of epochCommits) commitExists(commit, 'epochs.yaml');

const manifestDir = path.join(assetRoot, 'capabilities');
const manifestPaths = fs.existsSync(manifestDir)
  ? fs.readdirSync(manifestDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(manifestDir, entry.name, 'asset.yaml'))
    .filter(fs.existsSync)
    .sort()
  : [];
const manifests = [];
const allIds = new Set();
for (const manifestPath of manifestPaths) {
  const manifest = readJson(manifestPath, manifestPath.replace(root + path.sep, '').replaceAll(path.sep, '/'));
  if (manifest?.id) allIds.add(manifest.id);
  manifests.push({ path: manifestPath, data: manifest });
}
for (const record of manifests) checkManifest(record.data, record.path, schema, epochCommits, allIds);
if (allIds.size !== manifestPaths.length) addError('capability manifest IDs must be unique');

if (!isObject(catalog)) {
  addError('catalog.yaml must be JSON-compatible YAML');
} else {
  if (catalog.schemaVersion !== 1 || catalog.kind !== 'capability-asset-catalog') addError('catalog metadata is invalid');
  if (!Array.isArray(catalog.assets)) addError('catalog.assets must be an array');
  const catalogIds = new Set((catalog.assets || []).map((asset) => asset.id));
  if (catalog.assetCount !== (catalog.assets || []).length) addError('catalog.assetCount does not match catalog.assets');
  if (catalogIds.size !== (catalog.assets || []).length) addError('catalog asset IDs must be unique');
  if (catalogIds.size !== allIds.size || [...allIds].some((id) => !catalogIds.has(id))) addError('catalog and manifest ID sets differ');
  for (const asset of catalog.assets || []) {
    if (!allIds.has(asset.id)) continue;
    const manifestRecord = manifests.find((record) => record.data?.id === asset.id);
    if (!manifestRecord) continue;
    const expectedPath = path.relative(assetRoot, manifestRecord.path).replaceAll(path.sep, '/');
    if (asset.path !== expectedPath) addError('catalog path mismatch for ' + asset.id);
    if (asset.domain !== manifestRecord.data.category) addError('catalog domain mismatch for ' + asset.id);
    if (asset.status !== manifestRecord.data.status) addError('catalog status mismatch for ' + asset.id);
    for (const key of ['agent_workflow', 'project_knowledge_lifecycle']) {
      if (asset.relevance?.[key] !== manifestRecord.data.product_relevance?.relevant && key === 'agent_workflow') {
        warnings.push('catalog relevance is intentionally more granular than manifest relevance for ' + asset.id);
      }
    }
  }
  const computedCounts = {};
  for (const asset of catalog.assets || []) computedCounts[asset.status] = (computedCounts[asset.status] || 0) + 1;
  for (const status of catalog.classification?.statuses || []) {
    if ((catalog.classification?.counts?.[status] || 0) !== (computedCounts[status] || 0)) {
      addError('catalog classification count mismatch for ' + status);
    }
  }
  if (catalog.scope?.runtimeLoaded !== false || catalog.scope?.installerLoaded !== false || catalog.scope?.productionBehaviorChanged !== false || catalog.scope?.decomplexificationPerformed !== false || catalog.scope?.sourceSnapshotsCopied !== false) {
    addError('catalog scope boundary must remain non-runtime and non-decomplexification');
  }
  if (catalog.freeze?.baselineStatus !== 'frozen' || catalog.freeze?.decomplexification !== 'not performed; separately authorized work required') {
    addError('catalog freeze boundary is incomplete');
  }
}

if (!inventory.includes('finalClassification: complete')) addError('inventory-current.yaml finalClassification is not complete');
if (!inventory.includes('perCapabilityManifests: complete')) addError('inventory-current.yaml must record complete manifests');
if (!inventory.includes('relayHistory: complete')) addError('inventory-current.yaml relayHistory is not complete');
if (!inventory.includes('kernelHistory: complete')) addError('inventory-current.yaml kernelHistory is not complete');

const result = {
  schemaVersion: 1,
  status: errors.length === 0 ? 'pass' : 'fail',
  readOnly: true,
  baselineCommit: '9701a86d2225c938f13982a7e0f7f43a7f9bc10e',
  assetCount: manifests.length,
  statusCounts: manifests.reduce((counts, record) => {
    const status = record.data?.status || 'invalid';
    counts[status] = (counts[status] || 0) + 1;
    return counts;
  }, {}),
  checked: {
    manifestSchema: fs.existsSync(schemaPath),
    catalog: fs.existsSync(catalogPath),
    taxonomy: fs.existsSync(taxonomyPath),
    epochs: fs.existsSync(epochsPath),
    inventory: fs.existsSync(inventoryPath),
    immutableCommits: epochCommits.size,
    proofPaths: manifests.reduce((count, record) => count + (record.data?.proof?.tests?.length || 0), 0),
    dependencies: manifests.reduce((count, record) => count + (record.data?.dependencies?.capabilities?.length || 0), 0)
  },
  warnings,
  errors
};

process.stdout.write(JSON.stringify(result, null, 2) + '\n');
process.exitCode = errors.length === 0 ? 0 : 1;
