import crypto from 'node:crypto';
import fs from 'node:fs';
import { readFile, writeFile, mkdir, rename, access } from 'node:fs/promises';
import path from 'node:path';
import { resolveKernelRuntimeHome, assertIsolatedRuntimeHomes } from '../runtime-home.mjs';
import { resolveKernelProjectIdentity } from '../project-identity.mjs';

export class KernelKnowledgeStoreError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'KernelKnowledgeStoreError';
    this.code = code;
    this.details = details;
  }
}

export function projectKnowledgeDirectory(projectId, { env = process.env } = {}) {
  const kernelHome = resolveKernelRuntimeHome({ env });
  assertIsolatedRuntimeHomes(kernelHome);
  return path.join(kernelHome, 'state', 'projects', projectId);
}

export async function ensureKnowledgeStoreDirectories(projectId, { env = process.env } = {}) {
  const root = projectKnowledgeDirectory(projectId, { env });
  const dirs = [
    root,
    path.join(root, 'knowledge', 'policy'),
    path.join(root, 'knowledge', 'semantic'),
    path.join(root, 'knowledge', 'architecture'),
    path.join(root, 'knowledge', 'episodic'),
    path.join(root, 'knowledge', 'graph'),
    path.join(root, 'knowledge', 'ontology'),
    path.join(root, 'knowledge', 'provenance'),
    path.join(root, 'knowledge', 'candidates'),
    path.join(root, 'context-packs'),
    path.join(root, 'receipts'),
  ];
  for (const dir of dirs) {
    await mkdir(dir, { recursive: true });
  }

  // Ensure revision.json exists
  const revisionPath = path.join(root, 'knowledge', 'revision.json');
  try {
    await access(revisionPath);
  } catch {
    const defaultRevision = {
      schemaVersion: 1,
      projectId,
      revision: '1',
      updatedAt: new Date().toISOString(),
    };
    await writeAtomicJson(revisionPath, defaultRevision);
  }
  return root;
}

export async function writeAtomicJson(filePath, data) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${crypto.randomUUID()}.tmp`;
  const content = JSON.stringify(data, null, 2);
  await writeFile(tempPath, content, 'utf8');
  await rename(tempPath, filePath);
}

export async function readJsonIfExists(filePath, fallback = null) {
  try {
    const text = await readFile(filePath, 'utf8');
    return JSON.parse(text);
  } catch (err) {
    if (err.code === 'ENOENT') return fallback;
    throw new KernelKnowledgeStoreError('STORE_CORRUPTED', `Knowledge store file corrupted: ${filePath} - ${err.message}`, { filePath, error: err });
  }
}

export async function readJsonlIfExists(filePath) {
  try {
    const text = await readFile(filePath, 'utf8');
    return text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw new KernelKnowledgeStoreError('STORE_CORRUPTED', `Knowledge store file corrupted: ${filePath} - ${err.message}`, { filePath, error: err });
  }
}

export async function writeAtomicJsonl(filePath, records) {
  await mkdir(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${crypto.randomUUID()}.tmp`;
  const lines = records.map((r) => JSON.stringify(r)).join('\n');
  await writeFile(tempPath, lines ? `${lines}\n` : '', 'utf8');
  await rename(tempPath, filePath);
}

export async function readProjectRevision(projectId, { env = process.env } = {}) {
  const root = projectKnowledgeDirectory(projectId, { env });
  const revisionPath = path.join(root, 'knowledge', 'revision.json');
  const data = await readJsonIfExists(revisionPath);
  return data?.revision || '0';
}

export async function loadAllProjectRecords(projectId, { env = process.env } = {}) {
  await ensureKnowledgeStoreDirectories(projectId, { env });
  const root = projectKnowledgeDirectory(projectId, { env });
  const kDir = path.join(root, 'knowledge');

  const policyAnchors = await readJsonlIfExists(path.join(kDir, 'policy', 'policy-anchors.jsonl'));
  const semanticFacts = await readJsonlIfExists(path.join(kDir, 'semantic', 'verified-facts.jsonl'));
  const architectureRecords = await readJsonlIfExists(path.join(kDir, 'architecture', 'records.jsonl'));
  const architectureDecisions = await readJsonlIfExists(path.join(kDir, 'architecture', 'decisions.jsonl'));
  const supersessionLog = await readJsonlIfExists(path.join(kDir, 'semantic', 'supersession-log.jsonl'));
  const observations = await readJsonlIfExists(path.join(kDir, 'episodic', 'observations.jsonl'));
  const kgRelations = await readJsonlIfExists(path.join(kDir, 'graph', 'kg-relations.jsonl'));
  const ontologyConstraints = await readJsonlIfExists(path.join(kDir, 'ontology', 'constraints.jsonl'));
  const provenanceLog = await readJsonlIfExists(path.join(kDir, 'provenance', 'prov-log.jsonl'));
  const pendingCandidates = await readJsonlIfExists(path.join(kDir, 'candidates', 'pending.jsonl'));
  const rejectedCandidates = await readJsonlIfExists(path.join(kDir, 'candidates', 'rejected.jsonl'));

  return {
    policyAnchors,
    semanticFacts,
    architectureRecords,
    architectureDecisions,
    supersessionLog,
    observations,
    kgRelations,
    ontologyConstraints,
    provenanceLog,
    pendingCandidates,
    rejectedCandidates,
  };
}
