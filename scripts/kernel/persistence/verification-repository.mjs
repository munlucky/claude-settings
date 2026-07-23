function now() {
  return new Date().toISOString();
}

export function createVerificationRepository(db) {
  return {
    recordVerification(runId, { status = 'passed', evidenceRef = 'ev-1', command = 'test', exitCode = 0, evidenceDigest = '', sourceIdentity = '', verifiedMutationRevision = 0, acceptanceCoverage = [] }) {
      const run = db.prepare(`SELECT project_id, mutation_revision FROM runs WHERE run_id=?`).get(runId);
      const projectId = run ? run.project_id : 'unknown';
      const mutRev = run ? Number(run.mutation_revision) : verifiedMutationRevision;

      db.prepare(`
        INSERT INTO verifications(
          run_id, project_id, status, evidence_ref, command, exit_code, evidence_digest,
          source_identity, verified_mutation_revision, acceptance_coverage_json, created_at
        )
        VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        runId, projectId, status, evidenceRef, command, exitCode, evidenceDigest,
        sourceIdentity, mutRev, JSON.stringify(acceptanceCoverage), now()
      );
    },

    listVerifications(runId) {
      const rows = db.prepare(`SELECT * FROM verifications WHERE run_id=? ORDER BY id ASC`).all(runId);
      return rows.map((r) => ({
        id: r.id,
        runId: r.run_id,
        projectId: r.project_id,
        status: r.status,
        evidenceRef: r.evidence_ref,
        command: r.command,
        exitCode: Number(r.exit_code),
        evidenceDigest: r.evidence_digest,
        sourceIdentity: r.source_identity,
        verifiedMutationRevision: Number(r.verified_mutation_revision),
        acceptanceCoverage: r.acceptance_coverage_json ? JSON.parse(r.acceptance_coverage_json) : [],
        createdAt: r.created_at,
      }));
    },

    ensureRunObligation(runId, { obligationId, sourceType, sourceRef, candidateId = null, mutationRevision = 0 }) {
      const run = db.prepare(`SELECT project_id FROM runs WHERE run_id=?`).get(runId);
      const projectId = run ? run.project_id : 'unknown';

      db.prepare(`
        INSERT INTO run_obligations(run_id, project_id, obligation_id, source_type, source_ref, candidate_id, mutation_revision, status, created_at)
        VALUES(?, ?, ?, ?, ?, ?, ?, 'pending', ?)
        ON CONFLICT(run_id, obligation_id) DO NOTHING
      `).run(runId, projectId, obligationId, sourceType, sourceRef, candidateId, mutationRevision, now());
    },

    listRunObligations(runId) {
      const rows = db.prepare(`SELECT * FROM run_obligations WHERE run_id=?`).all(runId);
      return rows.map((r) => ({
        runId: r.run_id,
        projectId: r.project_id,
        obligationId: r.obligation_id,
        sourceType: r.source_type,
        sourceRef: r.source_ref,
        candidateId: r.candidate_id,
        mutationRevision: Number(r.mutation_revision),
        status: r.status,
        createdAt: r.created_at,
      }));
    },
  };
}
