const sanitize = (value) => String(value || '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-|-$/g, '')
  .slice(0, 64) || 'candidate';

const yyyymmdd = (date) => date.replaceAll('-', '');

export function priorityForFailureClass(failureClass, count, records) {
  const critical = records.some((record) => Number(record.reviewFindings?.critical || 0) > 0);
  if (failureClass === 'verification_evidence_missing' || critical) return 'P0';
  if (count >= 3) return 'P0';
  if (count >= 2) return 'P1';
  return 'P2';
}

export function targetForFailureClass(failureClass) {
  const map = {
    acceptance_mapping_missing: 'planning',
    verification_evidence_missing: 'verification-contract',
    docs_not_updated: 'documentation',
    baseline_env_mismatch: 'prepare',
    critical_review_finding: 'review-policy',
  };
  return map[failureClass] || 'workflow';
}

export function titleForFailureClass(failureClass) {
  const map = {
    acceptance_mapping_missing: 'Require acceptance-to-verifier mapping',
    verification_evidence_missing: 'Require concrete verification evidence before closeout',
    docs_not_updated: 'Add documentation impact check to closeout',
    baseline_env_mismatch: 'Capture baseline environment fingerprint',
    critical_review_finding: 'Escalate critical review findings before completion',
  };
  return map[failureClass] || `Investigate repeated ${failureClass}`;
}

export function buildRetroPatterns({ projectId, date, records }) {
  const failureMap = new Map();
  for (const record of records) {
    for (const failureClass of new Set(record.failureClasses || [])) {
      if (!failureMap.has(failureClass)) failureMap.set(failureClass, []);
      failureMap.get(failureClass).push(record.taskId);
    }
  }

  const repeatedFailureClasses = [...failureMap.entries()]
    .filter(([, tasks]) => tasks.length >= 2)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([failureClass, tasks]) => ({
      failureClass,
      count: tasks.length,
      affectedTasks: tasks.sort(),
      severity: priorityForFailureClass(failureClass, tasks.length, records) === 'P0' ? 'high' : 'medium',
    }));

  const rootPatterns = repeatedFailureClasses.map((entry, index) => ({
    id: `PAT-${yyyymmdd(date)}-${String(index + 1).padStart(3, '0')}`,
    title: titleForFailureClass(entry.failureClass),
    evidenceTasks: entry.affectedTasks,
    recommendedLayer: targetForFailureClass(entry.failureClass),
    confidence: entry.count >= 3 ? 'high' : 'medium',
  }));

  const improvementCandidates = rootPatterns.map((pattern, index) => {
    const source = repeatedFailureClasses[index];
    const priority = priorityForFailureClass(source.failureClass, source.count, records);
    return {
      id: `HARN-${yyyymmdd(date)}-${String(index + 1).padStart(3, '0')}-${sanitize(source.failureClass)}`,
      title: pattern.title,
      priority,
      targetArea: pattern.recommendedLayer,
      expectedImpact: `Reduce repeated ${source.failureClass} failures across ${projectId} tasks.`,
      risk: 'May add workflow friction if enforced without a lightweight path for small tasks.',
      evidencePatternIds: [pattern.id],
      mapsToSchema: 'schemas/improvement-candidate-v1.schema.json',
      promotionAuthority: false,
    };
  });

  return { repeatedFailureClasses, rootPatterns, improvementCandidates };
}
