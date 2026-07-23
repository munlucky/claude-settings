function now() {
  return new Date().toISOString();
}

export function createFinalizationRepository(db) {
  return {
    recordCompletionDecision(runId, decision) {
      const run = db.prepare(`SELECT project_id, mutation_revision FROM runs WHERE run_id=?`).get(runId);
      const projectId = decision.projectId || (run ? run.project_id : 'unknown');
      const mutRev = decision.mutationRevision !== undefined ? decision.mutationRevision : (run ? Number(run.mutation_revision) : 0);

      db.prepare(`
        INSERT INTO completion_decisions(run_id, project_id, decision, decision_json, mutation_revision, created_at)
        VALUES(?, ?, ?, ?, ?, ?)
        ON CONFLICT(run_id) DO UPDATE SET decision=excluded.decision, decision_json=excluded.decision_json, created_at=excluded.created_at
      `).run(runId, projectId, decision.decision || 'accepted', typeof decision === 'string' ? decision : JSON.stringify(decision), mutRev, now());
    },

    getCompletionDecision(runId) {
      const row = db.prepare(`SELECT * FROM completion_decisions WHERE run_id=?`).get(runId);
      if (!row) return null;
      return {
        runId: row.run_id,
        projectId: row.project_id,
        decision: row.decision,
        decisionJson: row.decision_json ? JSON.parse(row.decision_json) : null,
        mutationRevision: Number(row.mutation_revision),
        createdAt: row.created_at,
      };
    },

    recordKnowledgeCommitReceipt(runId, receipt) {
      const run = db.prepare(`SELECT project_id FROM runs WHERE run_id=?`).get(runId);
      const projectId = receipt.projectId || (run ? run.project_id : 'unknown');

      db.prepare(`
        INSERT INTO knowledge_commit_receipts(receipt_id, run_id, project_id, status, commit_digest, receipt_json, created_at)
        VALUES(?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(receipt_id) DO UPDATE SET status=excluded.status, receipt_json=excluded.receipt_json, created_at=excluded.created_at
      `).run(receipt.receiptId || `receipt-${runId}-${Date.now()}`, runId, projectId, receipt.status || 'committed', receipt.commitDigest || receipt.digest || 'digest', JSON.stringify(receipt), now());
    },

    getKnowledgeCommitReceipt(runId) {
      const row = db.prepare(`SELECT * FROM knowledge_commit_receipts WHERE run_id=?`).get(runId);
      if (!row) return null;
      return {
        receiptId: row.receipt_id,
        runId: row.run_id,
        projectId: row.project_id,
        status: row.status,
        commitDigest: row.commit_digest,
        receiptJson: row.receipt_json ? JSON.parse(row.receipt_json) : null,
        createdAt: row.created_at,
      };
    },

    recordFinalizationAuthorityReceipt(runId, receipt) {
      const run = db.prepare(`SELECT project_id FROM runs WHERE run_id=?`).get(runId);
      const projectId = receipt.projectId || (run ? run.project_id : 'unknown');

      db.prepare(`
        INSERT INTO finalization_authority_receipts(receipt_id, run_id, project_id, status, receipt_json, created_at)
        VALUES(?, ?, ?, ?, ?, ?)
        ON CONFLICT(receipt_id) DO UPDATE SET status=excluded.status, receipt_json=excluded.receipt_json, created_at=excluded.created_at
      `).run(receipt.receiptId || `auth-${runId}-${Date.now()}`, runId, projectId, receipt.status || 'committed', JSON.stringify(receipt), now());
    },

    getFinalizationAuthorityReceipt(runId) {
      const row = db.prepare(`SELECT * FROM finalization_authority_receipts WHERE run_id=?`).get(runId);
      if (!row) return null;
      return {
        receiptId: row.receipt_id,
        runId: row.run_id,
        projectId: row.project_id,
        status: row.status,
        receiptJson: row.receipt_json ? JSON.parse(row.receipt_json) : null,
        createdAt: row.created_at,
      };
    },

    recordFinalizationReceipt(runId, receipt) {
      this.recordFinalizationAuthorityReceipt(runId, receipt);
    },

    getFinalizationReceipt(runId) {
      return this.getFinalizationAuthorityReceipt(runId);
    },
  };
}
