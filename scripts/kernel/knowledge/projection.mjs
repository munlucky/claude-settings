import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolveKernelRuntimeHome } from '../runtime-home.mjs';

export async function rebuildKnowledgeProjection(projectId, { stateStore = null, runtimeHome = resolveKernelRuntimeHome() } = {}) {
  if (!stateStore) return { status: 'skipped' };

  const projectDir = path.join(runtimeHome, 'projects', projectId, 'knowledge');
  await mkdir(projectDir, { recursive: true });

  const records = stateStore.listKnowledgeRecords({ projectId, statuses: ['committed'] });
  const revision = stateStore.getProjectKnowledgeRevision ? stateStore.getProjectKnowledgeRevision(projectId) : 1;

  const facts = [];
  const practices = [];
  const constraints = [];
  const failures = [];

  for (const rec of records) {
    const raw = rec.recordJson || rec;
    const type = rec.type || rec.recordType;
    if (type === 'semantic_fact') facts.push(raw);
    else if (type === 'tacit_practice' || type === 'episodic_observation') practices.push(raw);
    else if (type === 'ontology_constraint') constraints.push(raw);
    else if (type === 'known_failure_pattern' || type === 'failure_pattern') failures.push(raw);
  }

  const writeJsonl = async (filename, items) => {
    const content = items.map((item) => JSON.stringify(item)).join('\n') + (items.length ? '\n' : '');
    await writeFile(path.join(projectDir, filename), content, 'utf8');
  };

  await writeJsonl('facts.jsonl', facts);
  await writeJsonl('practices.jsonl', practices);
  await writeJsonl('constraints.jsonl', constraints);
  await writeJsonl('failures.jsonl', failures);

  const revisionPayload = {
    projectId,
    revision,
    recordCount: records.length,
    updatedAt: new Date().toISOString(),
  };
  await writeFile(path.join(projectDir, 'revision.json'), JSON.stringify(revisionPayload, null, 2), 'utf8');

  return {
    status: 'rebuilt',
    projectId,
    revision,
    count: records.length,
    projectDir,
  };
}
