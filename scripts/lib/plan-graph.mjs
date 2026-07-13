const normalizePath = (value = '') => String(value).replaceAll('\\', '/').replace(/^\.?\//, '');

const unique = (items) => [...new Set(items)];

const overlaps = (left, right) => {
  const a = normalizePath(left);
  const b = normalizePath(right);
  const aPrefix = a.endsWith('/**') ? a.slice(0, -3) : a;
  const bPrefix = b.endsWith('/**') ? b.slice(0, -3) : b;
  return aPrefix === bPrefix || aPrefix.startsWith(`${bPrefix}/`) || bPrefix.startsWith(`${aPrefix}/`);
};

const matchesPattern = (file, pattern) => {
  const normalizedFile = normalizePath(file);
  const normalizedPattern = normalizePath(pattern);
  if (normalizedPattern.endsWith('/**')) {
    const prefix = normalizedPattern.slice(0, -3);
    return normalizedFile === prefix || normalizedFile.startsWith(`${prefix}/`);
  }
  if (normalizedPattern.endsWith('/')) {
    return normalizedFile.startsWith(normalizedPattern);
  }
  return normalizedFile === normalizedPattern || normalizedFile.startsWith(`${normalizedPattern}/`);
};

const isContainedBy = (candidate, container) => {
  const child = normalizePath(candidate);
  const parent = normalizePath(container);
  const parentPrefix = parent.endsWith('/**') ? parent.slice(0, -3) : parent;
  if (child.endsWith('/**') && !parent.endsWith('/**')) return false;
  return child === parent || child === parentPrefix || child.startsWith(`${parentPrefix}/`);
};

export const markdownPlanCompatibility = ({ phaseDocs = [] } = {}) => ({
  status: 'supported',
  executionMode: 'markdown-compatible',
  reason: 'markdown-only phase packages remain executable until a plan graph is explicitly adopted',
  phaseCount: phaseDocs.length,
});

export const validatePlanGraph = (graph = {}, { expectedPhaseDocs = [] } = {}) => {
  const findings = [];
  const phases = Array.isArray(graph.phases) ? graph.phases : [];
  const ids = new Set();
  if (graph.schemaVersion === undefined || graph.schemaVersion === null) {
    findings.push({ type: 'missing_schema_version', severity: 'blocking' });
  }
  if (!graph.planId) {
    findings.push({ type: 'missing_plan_id', severity: 'blocking' });
  }
  if (!Array.isArray(graph.phases)) {
    findings.push({ type: 'missing_phases', severity: 'blocking' });
  }

  for (const phase of phases) {
    if (!phase.id) findings.push({ type: 'missing_phase_id', severity: 'blocking' });
    if (!phase.doc) findings.push({ type: 'missing_phase_doc', phaseId: phase.id, severity: 'blocking' });
    if (ids.has(phase.id)) findings.push({ type: 'duplicate_phase_id', phaseId: phase.id, severity: 'blocking' });
    ids.add(phase.id);
    if (!Array.isArray(phase.ownedPaths) || phase.ownedPaths.length === 0) {
      findings.push({ type: 'missing_owned_paths', phaseId: phase.id, severity: 'blocking' });
    }
    const sliceIds = new Set();
    for (const slice of phase.slices || []) {
      if (!slice.id || sliceIds.has(slice.id)) {
        findings.push({ type: slice.id ? 'duplicate_slice_id' : 'missing_slice_id', phaseId: phase.id, sliceId: slice.id, severity: 'blocking' });
      }
      sliceIds.add(slice.id);
      if (!slice.objective || !slice.procedure || !slice.evidence?.command || !slice.evidence?.path) {
        findings.push({ type: 'incomplete_slice_contract', phaseId: phase.id, sliceId: slice.id, severity: 'blocking' });
      }
      for (const ownedPath of slice.ownedPaths || []) {
        if (!(phase.ownedPaths || []).some((phasePath) => isContainedBy(ownedPath, phasePath))) {
          findings.push({ type: 'slice_write_set_outside_phase', phaseId: phase.id, sliceId: slice.id, path: ownedPath, severity: 'blocking' });
        }
      }
    }
  }

  if (expectedPhaseDocs.length > 0) {
    const expected = unique(expectedPhaseDocs.map(normalizePath)).sort();
    const actual = unique(phases.map((phase) => normalizePath(phase.doc)).filter(Boolean)).sort();
    for (const doc of expected) {
      if (!actual.includes(doc)) {
        findings.push({ type: 'missing_graph_phase_doc', doc, severity: 'blocking' });
      }
    }
    for (const doc of actual) {
      if (!expected.includes(doc)) {
        findings.push({ type: 'unknown_graph_phase_doc', doc, severity: 'blocking' });
      }
    }
  }

  for (const phase of phases) {
    for (const dependency of phase.dependsOn || []) {
      if (!ids.has(dependency)) {
        findings.push({ type: 'missing_dependency', phaseId: phase.id, dependency, severity: 'blocking' });
      }
      if (dependency === phase.id) {
        findings.push({ type: 'self_dependency', phaseId: phase.id, severity: 'blocking' });
      }
    }
  }

  const parallelGroups = new Map();
  for (const phase of phases) {
    if (!phase.parallelGroup) continue;
    const group = parallelGroups.get(phase.parallelGroup) || [];
    group.push(phase);
    parallelGroups.set(phase.parallelGroup, group);
  }

  for (const [parallelGroup, group] of parallelGroups.entries()) {
    for (let leftIndex = 0; leftIndex < group.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < group.length; rightIndex += 1) {
        const left = group[leftIndex];
        const right = group[rightIndex];
        for (const leftPath of left.ownedPaths || []) {
          for (const rightPath of right.ownedPaths || []) {
            if (overlaps(leftPath, rightPath)) {
              findings.push({
                type: 'parallel_write_conflict',
                parallelGroup,
                phaseIds: [left.id, right.id],
                paths: [leftPath, rightPath],
                severity: 'blocking',
              });
            }
          }
        }
      }
    }
  }

  return {
    status: findings.some((finding) => finding.severity === 'blocking') ? 'blocked' : 'pass',
    phaseCount: phases.length,
    findings,
  };
};

export const schedulablePhases = ({ graph = {}, completed = [] } = {}) => {
  const completedSet = new Set(completed);
  return (graph.phases || [])
    .filter((phase) => !completedSet.has(phase.id))
    .filter((phase) => (phase.dependsOn || []).every((dependency) => completedSet.has(dependency)))
    .map((phase) => phase.id);
};

export const detectScopeDrift = ({ declaredWriteSet = [], changedFiles = [] } = {}) => {
  const normalizedWriteSet = unique(declaredWriteSet.map(normalizePath).filter(Boolean));
  const driftFiles = unique(changedFiles.map(normalizePath).filter(Boolean))
    .filter((file) => !normalizedWriteSet.some((pattern) => matchesPattern(file, pattern)));
  return {
    status: driftFiles.length > 0 ? 'drift' : 'clean',
    declaredWriteSet: normalizedWriteSet,
    driftFiles,
    findings: driftFiles.map((file) => ({
      type: 'scope_drift',
      severity: 'blocking',
      file,
      reason: 'changed file is outside declared write_set',
    })),
  };
};
