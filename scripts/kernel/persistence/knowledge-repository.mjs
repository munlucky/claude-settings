function now() {
  return new Date().toISOString();
}

export function createKnowledgeRepository(db) {
  return {
    saveCandidate(runId, candidate) {
      const run = db.prepare(`SELECT project_id, mutation_revision FROM runs WHERE run_id=?`).get(runId);
      const projectId = candidate.projectId || (run ? run.project_id : 'unknown');
      const mutRev = candidate.mutationRevision !== undefined ? candidate.mutationRevision : (run ? Number(run.mutation_revision) : 0);

      db.prepare(`
        INSERT INTO knowledge_candidates(
          candidate_id, run_id, project_id, proposed_type, statement, scope_json,
          evidence_refs_json, candidate_json, status, mutation_revision, created_at, updated_at
        )
        VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(candidate_id) DO UPDATE SET
          proposed_type=excluded.proposed_type,
          statement=excluded.statement,
          scope_json=excluded.scope_json,
          evidence_refs_json=excluded.evidence_refs_json,
          candidate_json=excluded.candidate_json,
          status=excluded.status,
          updated_at=excluded.updated_at
      `).run(
        candidate.candidateId, runId, projectId, candidate.proposedType || 'semantic_fact',
        candidate.statement || '', JSON.stringify(candidate.scope || []),
        JSON.stringify(candidate.evidenceRefs || []), JSON.stringify(candidate),
        candidate.status || 'observed', mutRev, now(), now()
      );
    },

    listCandidates(runId) {
      const rows = db.prepare(`SELECT * FROM knowledge_candidates WHERE run_id=?`).all(runId);
      return rows.map((r) => ({
        candidateId: r.candidate_id,
        runId: r.run_id,
        projectId: r.project_id,
        proposedType: r.proposed_type,
        statement: r.statement,
        scope: r.scope_json ? JSON.parse(r.scope_json) : [],
        evidenceRefs: r.evidence_refs_json ? JSON.parse(r.evidence_refs_json) : [],
        candidateJson: r.candidate_json ? JSON.parse(r.candidate_json) : null,
        status: r.status,
        mutationRevision: Number(r.mutation_revision),
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      }));
    },

    saveEvidenceBinding(candidateId, verificationId, runId, evidenceDigest, sourceIdentity, mutationRevision) {
      db.prepare(`
        INSERT INTO candidate_evidence_bindings(
          candidate_id, verification_id, run_id, evidence_digest, source_identity, mutation_revision, created_at
        )
        VALUES(?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(candidate_id, verification_id) DO NOTHING
      `).run(candidateId, verificationId, runId, evidenceDigest, sourceIdentity, mutationRevision, now());
    },

    listEvidenceBindings(runId) {
      const rows = db.prepare(`SELECT * FROM candidate_evidence_bindings WHERE run_id=?`).all(runId);
      return rows.map((r) => ({
        candidateId: r.candidate_id,
        verificationId: Number(r.verification_id),
        runId: r.run_id,
        evidenceDigest: r.evidence_digest,
        sourceIdentity: r.source_identity,
        mutationRevision: Number(r.mutation_revision),
        createdAt: r.created_at,
      }));
    },

    saveApproval(approvalId, { runId, candidateId, approvedBy, approvalReceipt }) {
      const candidate = db.prepare(`SELECT project_id FROM knowledge_candidates WHERE candidate_id=?`).get(candidateId);
      const projectId = candidate ? candidate.project_id : 'unknown';

      db.prepare(`
        INSERT INTO knowledge_approvals(approval_id, run_id, candidate_id, project_id, approved_by, approval_receipt, created_at)
        VALUES(?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(approval_id) DO NOTHING
      `).run(approvalId, runId, candidateId, projectId, approvedBy, approvalReceipt, now());
    },

    listApprovals(runId) {
      const rows = db.prepare(`SELECT * FROM knowledge_approvals WHERE run_id=?`).all(runId);
      return rows.map((r) => ({
        approvalId: r.approval_id,
        runId: r.run_id,
        candidateId: r.candidate_id,
        projectId: r.project_id,
        approvedBy: r.approved_by,
        approvalReceipt: r.approval_receipt,
        createdAt: r.created_at,
      }));
    },

    getProjectKnowledgeRevision(projectId) {
      const row = db.prepare(`SELECT revision FROM knowledge_revisions WHERE project_id=?`).get(projectId);
      return row ? Number(row.revision) : 0;
    },

    casKnowledgeRevision(projectId, expectedRevision, nextRevision) {
      const existing = db.prepare(`SELECT revision FROM knowledge_revisions WHERE project_id=?`).get(projectId);
      if (!existing) {
        if (expectedRevision !== 0) return false;
        db.prepare(`INSERT INTO knowledge_revisions(project_id, revision, updated_at) VALUES(?, ?, ?)`).run(projectId, nextRevision, now());
        return true;
      }
      const res = db.prepare(`UPDATE knowledge_revisions SET revision=?, updated_at=? WHERE project_id=? AND revision=?`).run(nextRevision, now(), projectId, expectedRevision);
      return res.changes === 1;
    },

    saveKnowledgeRecord(projectId, recordId, { recordType, status, trustTier, recordJson, revision }) {
      db.prepare(`
        INSERT INTO knowledge_records(project_id, record_id, record_type, status, trust_tier, record_json, revision, created_at, updated_at)
        VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(project_id, record_id) DO UPDATE SET
          record_type=excluded.record_type,
          status=excluded.status,
          trust_tier=excluded.trust_tier,
          record_json=excluded.record_json,
          revision=excluded.revision,
          updated_at=excluded.updated_at
      `).run(projectId, recordId, recordType, status, trustTier, typeof recordJson === 'string' ? recordJson : JSON.stringify(recordJson), revision, now(), now());
    },

    listKnowledgeRecords({ projectId, statuses = [], types = [], revisionAtMost = null }) {
      let query = `SELECT * FROM knowledge_records WHERE project_id=?`;
      const params = [projectId];

      if (statuses && statuses.length > 0) {
        query += ` AND status IN (${statuses.map(() => '?').join(',')})`;
        params.push(...statuses);
      }

      if (types && types.length > 0) {
        query += ` AND record_type IN (${types.map(() => '?').join(',')})`;
        params.push(...types);
      }

      if (revisionAtMost !== null) {
        query += ` AND revision <= ?`;
        params.push(revisionAtMost);
      }

      query += ` ORDER BY updated_at ASC`;

      const rows = db.prepare(query).all(...params);
      return rows.map((r) => {
        const parsed = r.record_json ? JSON.parse(r.record_json) : {};
        return {
          id: r.record_id,
          projectId: r.project_id,
          type: r.record_type,
          status: r.status,
          trustTier: r.trust_tier,
          revision: Number(r.revision),
          createdAt: r.created_at,
          updatedAt: r.updated_at,
          recordJson: parsed,
          ...parsed,
        };
      });
    },

    saveKnowledgeTransaction(transactionId, { projectId, runId, expectedRevision, targetRevision, status, transactionJson }) {
      db.prepare(`
        INSERT INTO knowledge_transactions(transaction_id, project_id, run_id, expected_revision, target_revision, status, transaction_json, created_at, completed_at)
        VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(transaction_id) DO UPDATE SET status=excluded.status, completed_at=excluded.completed_at
      `).run(transactionId, projectId, runId, expectedRevision, targetRevision, status, typeof transactionJson === 'string' ? transactionJson : JSON.stringify(transactionJson), now(), now());
    },
  };
}
