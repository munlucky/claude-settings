function now() {
  return new Date().toISOString();
}

export function createRunRepository(db) {
  return {
    createRun({ runId, objective, sourceIdentity, projectId, acceptanceCriteria = [], releaseEvidenceRequired = false }) {
      db.prepare(`
        INSERT INTO runs(
          run_id, project_id, state, status, objective, source_identity,
          mutation_revision, knowledge_revision_start, knowledge_revision_close,
          acceptance_criteria_json, release_evidence_required, created_at, updated_at
        )
        VALUES(?, ?, 'SHAPE', 'active', ?, ?, 0, 0, NULL, ?, ?, ?, ?)
      `).run(
        runId, projectId, objective, sourceIdentity,
        JSON.stringify(acceptanceCriteria),
        releaseEvidenceRequired ? 1 : 0,
        now(), now()
      );
      return this.getRun(runId);
    },

    getRun(runId) {
      const row = db.prepare(`SELECT * FROM runs WHERE run_id=?`).get(runId);
      if (!row) return null;
      return {
        runId: row.run_id,
        projectId: row.project_id,
        state: row.state,
        status: row.status,
        objective: row.objective,
        sourceIdentity: row.source_identity,
        mutationRevision: Number(row.mutation_revision),
        knowledgeRevisionStart: Number(row.knowledge_revision_start),
        knowledgeRevisionClose: row.knowledge_revision_close !== null ? Number(row.knowledge_revision_close) : null,
        acceptanceCriteria: row.acceptance_criteria_json ? JSON.parse(row.acceptance_criteria_json) : [],
        releaseEvidenceRequired: Boolean(row.release_evidence_required),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };
    },

    transitionState(runId, targetState) {
      const run = this.getRun(runId);
      if (!run) throw new Error(`Run ${runId} not found`);
      db.prepare(`UPDATE runs SET state=?, updated_at=? WHERE run_id=?`).run(targetState, now(), runId);
      return this.getRun(runId);
    },

    casCloseRun(runId, { expectedState = 'PROVE', expectedStatus = 'active', expectedMutationRevision = 0, knowledgeRevisionClose = 0, knowledgeStatus = 'committed' }) {
      const res = db.prepare(`
        UPDATE runs
        SET state = 'CLOSE',
            status = 'completed',
            knowledge_revision_close = ?,
            knowledge_status = ?,
            updated_at = ?
        WHERE run_id = ?
          AND state = ?
          AND status = ?
          AND mutation_revision = ?
      `).run(knowledgeRevisionClose, knowledgeStatus, now(), runId, expectedState, expectedStatus, expectedMutationRevision);

      return res.changes === 1;
    },

    incrementMutationRevision(runId) {
      db.prepare(`UPDATE runs SET mutation_revision = mutation_revision + 1, updated_at = ? WHERE run_id = ?`).run(now(), runId);
      return this.getRun(runId);
    },
  };
}
