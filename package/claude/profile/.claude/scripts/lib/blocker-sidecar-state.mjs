import fs from 'node:fs';

const ACTIVE_BLOCKER_STATUSES = new Set(['open', 'regressed']);
const HISTORICAL_BLOCKER_STATUSES = new Set(['resolved']);

function comparableTimestamp(record) {
  const value = record?.timestamp ?? record?.updatedAt ?? record?.createdAt ?? '';
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

function isNewerRecord(candidate, current) {
  const candidateTime = comparableTimestamp(candidate);
  const currentTime = comparableTimestamp(current);
  if (candidateTime !== null && currentTime !== null && candidateTime !== currentTime) {
    return candidateTime > currentTime;
  }
  if (candidateTime !== null && currentTime === null) {
    return true;
  }
  return (candidate.__appendIndex ?? 0) >= (current.__appendIndex ?? 0);
}

export function readJsonlFile(filePath, { fsImpl = fs } = {}) {
  const diagnostics = [];
  if (!fsImpl.existsSync(filePath)) {
    return { records: [], diagnostics: [{ type: 'missing_file', filePath }] };
  }

  const text = fsImpl.readFileSync(filePath, 'utf8');
  const records = [];
  let appendIndex = 0;

  text.split(/\r?\n/).forEach((line, index) => {
    if (!line.trim()) {
      return;
    }

    try {
      const parsed = JSON.parse(line);
      records.push({ ...parsed, __lineNumber: index + 1, __appendIndex: appendIndex });
      appendIndex += 1;
    } catch (error) {
      diagnostics.push({
        type: 'invalid_json',
        filePath,
        lineNumber: index + 1,
        message: error.message,
      });
    }
  });

  return { records, diagnostics };
}

export function dedupeBlockerEvidence(records) {
  const byId = new Map();
  for (const record of records) {
    if (!record?.id) {
      continue;
    }
    const current = byId.get(record.id);
    if (!current || isNewerRecord(record, current)) {
      byId.set(record.id, record);
    }
  }
  return [...byId.values()];
}

export function dedupeAttemptLedger(records) {
  const byTransaction = new Map();
  for (const record of records) {
    if (!record?.attemptId || !record?.transactionId) {
      continue;
    }
    const key = `${record.attemptId}\u0000${record.transactionId}`;
    const current = byTransaction.get(key);
    if (!current || isNewerRecord(record, current)) {
      byTransaction.set(key, record);
    }
  }
  return [...byTransaction.values()];
}

export function reduceLatestBlockerStatus(records) {
  const latest = dedupeBlockerEvidence(records);
  const active = [];
  const historical = [];
  const unknown = [];

  for (const record of latest) {
    if (ACTIVE_BLOCKER_STATUSES.has(record.status)) {
      active.push(record);
    } else if (HISTORICAL_BLOCKER_STATUSES.has(record.status)) {
      historical.push(record);
    } else {
      unknown.push(record);
    }
  }

  return { active, historical, unknown, latest };
}

export function detectSidecarMode({
  blockerEvidencePath,
  attemptLedgerPath,
  projectionManifestPath,
  fsImpl = fs,
} = {}) {
  const hasBlockerEvidence = Boolean(blockerEvidencePath && fsImpl.existsSync(blockerEvidencePath));
  const hasAttemptLedger = Boolean(attemptLedgerPath && fsImpl.existsSync(attemptLedgerPath));
  const hasManifest = Boolean(projectionManifestPath && fsImpl.existsSync(projectionManifestPath));

  if (!hasBlockerEvidence && !hasAttemptLedger && !hasManifest) {
    return { mode: 'legacy_verifier', hasBlockerEvidence, hasAttemptLedger, hasManifest };
  }
  if (hasBlockerEvidence && hasAttemptLedger && hasManifest) {
    return { mode: 'sidecar_canonical', hasBlockerEvidence, hasAttemptLedger, hasManifest };
  }
  if (hasManifest && (!hasBlockerEvidence || !hasAttemptLedger)) {
    return { mode: 'manifest_sidecar_missing', hasBlockerEvidence, hasAttemptLedger, hasManifest };
  }
  return { mode: 'incomplete_transaction', hasBlockerEvidence, hasAttemptLedger, hasManifest };
}

export function readBlockerSidecarState(paths, { fsImpl = fs } = {}) {
  const mode = detectSidecarMode({ ...paths, fsImpl });
  if (mode.mode !== 'sidecar_canonical') {
    return {
      mode: mode.mode,
      diagnostics: [],
      blockerEvidence: [],
      attemptLedger: [],
      latestBlockers: { active: [], historical: [], unknown: [], latest: [] },
    };
  }

  const blockerEvidenceRead = readJsonlFile(paths.blockerEvidencePath, { fsImpl });
  const attemptLedgerRead = readJsonlFile(paths.attemptLedgerPath, { fsImpl });
  const blockerEvidence = dedupeBlockerEvidence(blockerEvidenceRead.records);
  const attemptLedger = dedupeAttemptLedger(attemptLedgerRead.records);

  return {
    mode: mode.mode,
    diagnostics: [...blockerEvidenceRead.diagnostics, ...attemptLedgerRead.diagnostics],
    blockerEvidence,
    attemptLedger,
    latestBlockers: reduceLatestBlockerStatus(blockerEvidenceRead.records),
  };
}
