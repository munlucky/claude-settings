#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { validateJsonSchema } from './json-schema-lite.mjs';

const hash = (value) => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
const list = (raw, key) => {
  const match = raw.match(new RegExp(`^${key}:\\s*\\n((?:\\s+-\\s+.*\\n?)*)`, 'm'));
  return match ? [...match[1].matchAll(/^\s+-\s+["']?(.+?)["']?\s*$/gm)].map((entry) => entry[1]) : [];
};
const scalar = (raw, key) => raw.match(new RegExp(`^${key}:\\s*["']?(.+?)["']?\\s*$`, 'm'))?.[1] || '';
const sectionBullets = (body, headingPattern) => {
  const match = body.match(new RegExp(`^##\\s+(?:${headingPattern})\\s*$([\\s\\S]*?)(?=^##\\s+|(?![\\s\\S]))`, 'mi'));
  return match ? [...match[1].matchAll(/^\s*(?:-|\d+[.)])\s+(.+)$/gm)].map((entry) => entry[1].trim()) : [];
};
const policyBullets = (body) => [...body.matchAll(/^\s*-\s+(.+)$/gm)]
  .map((entry) => entry[1].trim())
  .filter((line) => /\b(?:must|must not|do not|never|only|require|required|forbid|cannot|without)\b/i.test(line));
const defaultPaths = (text) => [...new Set([...text.matchAll(/`([^`]*(?:\/|\\)[^`]*)`/g)].map((entry) => entry[1]).filter((entry) => !entry.includes(' ')).slice(0, 20))];
const sectionText = (body, heading) => body.match(new RegExp(`^##\\s+${heading}\\s*$([\\s\\S]*?)(?=^##\\s+|(?![\\s\\S]))`, 'mi'))?.[1].trim().replace(/\s+/g, ' ') || '';
const policyBinding = (body, name) => {
  const routingHeading = ['commit-moonshot', 'session-logger'].includes(name) ? 'Explicit Invocation' : 'Route Away';
  const clauses = [
    ['use-when', sectionText(body, 'Use When') || sectionText(body, 'Role')],
    ['routing', sectionText(body, routingHeading)],
    ['hard-stops', sectionText(body, 'Hard Stops')],
    ['output-contract', sectionText(body, 'Output Contract')],
  ];
  return {
    policyClauseIds: clauses.map(([id]) => `${name}.policy.${id}`),
    sourcePolicyDigest: hash({ clauses, defaultPathClauses: defaultPaths(body) }),
  };
};
const exists = async (target) => { try { await access(target); return true; } catch { return false; } };

const loadSemanticContracts = async (target, expectedNames, referenceRoot) => {
  if (!await exists(target)) return null;
  const contract = JSON.parse(await readFile(target, 'utf8'));
  if (contract.schemaVersion !== 'moonshot-public-skill-semantic-contract.v1') throw new Error('invalid public skill semantic contract schemaVersion');
  if (JSON.stringify(Object.keys(contract.skills || {})) !== JSON.stringify(expectedNames)) throw new Error('public skill semantic contract order mismatch');
  for (const name of expectedNames) {
    const entry = contract.skills[name];
    if (!Array.isArray(entry?.defaultPaths) || !Array.isArray(entry?.hardStopIds) || entry.hardStopIds.length === 0) throw new Error(`invalid public skill semantic contract for ${name}`);
    if (new Set(entry.hardStopIds).size !== entry.hardStopIds.length || entry.hardStopIds.some((id) => !id.startsWith(`${name}.hard-stop.`))) throw new Error(`invalid hard-stop IDs for ${name}`);
    const referencePath = path.join(referenceRoot, name, 'references', 'compatibility-contract.md');
    if (!await exists(referencePath)) throw new Error(`missing compatibility contract reference for ${name}`);
    const skillSource = await readFile(path.join(referenceRoot, name, 'SKILL.md'), 'utf8');
    if (!list(skillSource.slice(4, skillSource.indexOf('\n---', 4)), 'deepReferences').includes('references/compatibility-contract.md')) throw new Error(`undeclared compatibility contract reference for ${name}`);
    const reference = await readFile(referencePath, 'utf8');
    const referencedPaths = defaultPaths(reference);
    const referencedStops = sectionBullets(reference, 'Hard Stops');
    const referencedIds = referencedStops.map((line, index) => `${name}.hard-stop.${String(index + 1).padStart(2, '0')}:${hash(line).slice(0, 12)}`);
    if (JSON.stringify(referencedPaths) !== JSON.stringify(entry.defaultPaths)) throw new Error(`default path semantic contract drift for ${name}`);
    if (JSON.stringify(referencedIds) !== JSON.stringify(entry.hardStopIds)) throw new Error(`hard-stop semantic contract drift for ${name}`);
  }
  return contract.skills;
};

export async function generateSkillCompatibilityManifest({ repoRoot = process.cwd(), sourceFingerprint = '', semanticContractPath = '', compatibilityReferenceRoot = '' } = {}) {
  const runtimeSurface = JSON.parse(await readFile(path.join(repoRoot, 'package/runtime-surface.json'), 'utf8'));
  const catalog = JSON.parse(await readFile(path.join(repoRoot, 'catalog/moonshot-catalog.json'), 'utf8'));
  const publicEntries = runtimeSurface.publicRuntimeSkills || [];
  const semanticContracts = await loadSemanticContracts(
    semanticContractPath || path.join(repoRoot, 'tools/evals/public-skill-semantic-contract.json'),
    publicEntries,
    compatibilityReferenceRoot || path.join(repoRoot, 'skills'),
  );
  const catalogByName = new Map((catalog.publicEntrypoints || []).map((entry) => [entry.name, entry]));
  const resolvedFingerprint = sourceFingerprint || hash(await Promise.all(publicEntries.map((name) => readFile(path.join(repoRoot, 'skills', name, 'SKILL.md'), 'utf8'))));
  const skills = [];
  for (const [publicPosition, name] of publicEntries.entries()) {
    const text = await readFile(path.join(repoRoot, 'skills', name, 'SKILL.md'), 'utf8');
    const split = text.indexOf('\n---', 4);
    const frontmatter = split >= 0 ? text.slice(4, split) : '';
    const body = split >= 0 ? text.slice(split + 4) : text;
    const hardStops = [...new Set([...sectionBullets(body, 'Hard Stops|Hard rules|Operating rules'), ...policyBullets(body)])];
    const completion = sectionBullets(body, 'Output Contract|Required Evidence|Completion|Minimum logging contract|Required flow');
    const legacyProcedureCompletion = completion.length ? completion : sectionBullets(body, 'Procedure');
    const outputArtifacts = list(frontmatter, 'outputArtifacts');
    const artifactDefinedCompletion = name === 'product-orchestrator';
    const requiredOutputs = artifactDefinedCompletion && outputArtifacts.length
      ? outputArtifacts
      : (legacyProcedureCompletion.length ? legacyProcedureCompletion : outputArtifacts);
    const sourceBinding = policyBinding(body, name);
    if (JSON.stringify(list(frontmatter, 'policyClauseIds')) !== JSON.stringify(sourceBinding.policyClauseIds) || scalar(frontmatter, 'policyDigest') !== sourceBinding.sourcePolicyDigest) throw new Error(`source policy binding drift for ${name}`);
    const contract = {
      name, publicPosition,
      descriptionIntent: scalar(frontmatter, 'description') || catalogByName.get(name)?.purpose || '',
      triggers: list(frontmatter, 'triggers').length ? list(frontmatter, 'triggers') : [`$${name}`],
      outputArtifacts,
      requiredOutputs,
      conditionalOutputs: [],
      defaultPaths: semanticContracts?.[name]?.defaultPaths || defaultPaths(body),
      hardStopIds: semanticContracts?.[name]?.hardStopIds || hardStops.map((line, index) => `${name}.hard-stop.${String(index + 1).padStart(2, '0')}:${hash(line).slice(0, 12)}`),
      ...sourceBinding,
      completionSemantics: requiredOutputs,
      directInvocationExamples: [`$${name}`, `Use ${name} for this request.`],
    };
    skills.push({ ...contract, contractHash: hash(contract) });
  }
  const manifest = { schemaVersion: 'moonshot-skill-compatibility.v1', sourceFingerprint: resolvedFingerprint, orderedPublicContractHash: hash(skills.map(({ name, contractHash }) => ({ name, contractHash }))), skills };
  const schema = JSON.parse(await readFile(path.join(repoRoot, 'schemas/skill-compatibility-manifest.schema.json'), 'utf8'));
  validateSkillCompatibilityManifest(manifest, publicEntries, schema);
  return manifest;
}

export function validateSkillCompatibilityManifest(manifest, expectedNames = [], schema = null) {
  if (schema) {
    const schemaErrors = validateJsonSchema(manifest, schema);
    if (schemaErrors.length) throw new Error(`compatibility manifest schema validation failed: ${schemaErrors.join('; ')}`);
  }
  if (manifest?.schemaVersion !== 'moonshot-skill-compatibility.v1') throw new Error('invalid compatibility manifest schemaVersion');
  if (!Array.isArray(manifest.skills) || (expectedNames.length > 0 ? manifest.skills.length !== expectedNames.length : manifest.skills.length === 0)) throw new Error('compatibility manifest skill count does not match the public runtime surface');
  const names = manifest.skills.map((skill) => skill.name);
  if (expectedNames.length && JSON.stringify(names) !== JSON.stringify(expectedNames)) throw new Error('compatibility manifest public order mismatch');
  for (const [index, skill] of manifest.skills.entries()) {
    if (skill.publicPosition !== index || !skill.contractHash || skill.directInvocationExamples.length === 0) throw new Error(`invalid compatibility contract for ${skill.name}`);
    if (!skill.descriptionIntent || !Array.isArray(skill.triggers) || skill.triggers.length === 0) throw new Error(`missing canonical invocation metadata for ${skill.name}`);
    if (!Array.isArray(skill.hardStopIds) || skill.hardStopIds.length === 0) throw new Error(`missing hard-stop metadata for ${skill.name}`);
    if (!Array.isArray(skill.policyClauseIds) || skill.policyClauseIds.length < 4 || !/^[a-f0-9]{64}$/.test(skill.sourcePolicyDigest || '')) throw new Error(`missing source policy binding for ${skill.name}`);
    if (!Array.isArray(skill.requiredOutputs) || skill.requiredOutputs.length === 0 || !Array.isArray(skill.completionSemantics) || skill.completionSemantics.length === 0) throw new Error(`missing output/completion metadata for ${skill.name}`);
    const { contractHash, ...contract } = skill;
    if (hash(contract) !== contractHash) throw new Error(`compatibility contract hash mismatch for ${skill.name}`);
  }
  if (hash(manifest.skills.map(({ name, contractHash }) => ({ name, contractHash }))) !== manifest.orderedPublicContractHash) throw new Error('ordered public contract hash mismatch');
  return true;
}

async function main() {
  const args = process.argv.slice(2); const option = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : ''; };
  const repoRoot = path.resolve(option('--repo-root') || process.cwd());
  const manifest = await generateSkillCompatibilityManifest({ repoRoot, sourceFingerprint: option('--source-fingerprint') });
  const out = option('--out');
  if (out) { const target = path.resolve(out); await mkdir(path.dirname(target), { recursive: true }); await writeFile(target, `${JSON.stringify(manifest, null, 2)}\n`); }
  console.log(JSON.stringify(manifest, null, 2));
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main().catch((error) => { console.error(error.message); process.exitCode = 1; });
