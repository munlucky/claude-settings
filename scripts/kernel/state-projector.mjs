import path from 'node:path';
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const digest = (v) => createHash('sha256').update(JSON.stringify(v)).digest('hex');

export const buildProjection = (run) => ({
  schemaVersion: 1,
  runId: run.runId,
  runtimeRevision: run.revision,
  mutationRevision: run.mutationRevision,
  status: run.status,
  currentState: run.state,
  sourceDigest: digest(run),
  bundleId: `${run.runId}:${run.revision}:${run.mutationRevision ?? 0}`,
});

const atomicWriteFile = async (filePath, content) => {
  const tmpPath = `${filePath}.tmp.${Date.now()}.${Math.random().toString(36).slice(2, 8)}`;
  await writeFile(tmpPath, content);
  await rename(tmpPath, filePath);
};

export const readProjection = async ({ outputDir }) => {
  const bundle = JSON.parse(await readFile(path.join(outputDir, 'projection-bundle.json'), 'utf8'));
  if (bundle.schemaVersion !== 1 || !bundle.json || bundle.bundleId !== bundle.json.bundleId) {
    throw new Error('Kernel projection bundle is invalid');
  }
  return bundle.json;
};

export const writeProjection = async ({ run, outputDir }) => {
  await mkdir(outputDir, { recursive: true });
  const p = buildProjection(run);

  const jsonContent = JSON.stringify(p, null, 2);
  const mdContent = `# Kernel Run ${run.runId}\n\n- Status: ${run.status}\n- State: ${run.state}\n- Runtime revision: ${run.revision}\n- Mutation revision: ${run.mutationRevision}\n- Source digest: ${p.sourceDigest}\n`;

  // The bundle is the atomic authority; the JSON and Markdown files are read-only projections.
  await atomicWriteFile(path.join(outputDir, 'projection-bundle.json'), JSON.stringify({ schemaVersion: 1, bundleId: p.bundleId, json: p, markdown: mdContent }, null, 2));
  await atomicWriteFile(path.join(outputDir, 'run-status.json'), jsonContent);
  await atomicWriteFile(path.join(outputDir, 'STATE.md'), mdContent);
  return p;
};

export const verifyProjection = async ({ run, file }) => {
  const bundled = await readProjection({ outputDir: path.dirname(file) });
  const actual = JSON.parse(await readFile(file, 'utf8'));
  const expected = buildProjection(run);
  return {
    valid:
      JSON.stringify(actual) === JSON.stringify(bundled) &&
      actual.sourceDigest === expected.sourceDigest &&
      actual.runtimeRevision === expected.runtimeRevision &&
      actual.mutationRevision === expected.mutationRevision &&
      actual.status === expected.status &&
      actual.currentState === expected.currentState &&
      actual.runId === expected.runId,
    actual,
    expected,
  };
};

export const projectRunState = async (run, { runtimeHome } = {}) => {
  if (!run || !runtimeHome) return null;
  const outputDir = path.join(runtimeHome, 'projections', run.runId);
  return writeProjection({ run, outputDir });
};
