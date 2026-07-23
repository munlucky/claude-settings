function now() {
  return new Date().toISOString();
}

export function createGitOutboxRepository(db) {
  return {
    enqueueGitCloseoutJob(jobId, { runId, projectId, mode = 'commit', branch = 'main', remote = 'origin', selectedPaths = [], approvalReceipt = '', commitSha = null }) {
      db.prepare(`
        INSERT INTO git_closeout_jobs(
          job_id, run_id, project_id, status, mode, branch, remote,
          selected_paths_json, approval_receipt, commit_sha, attempt_count, created_at, updated_at
        )
        VALUES(?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, 0, ?, ?)
        ON CONFLICT(job_id) DO NOTHING
      `).run(
        jobId, runId, projectId, mode, branch, remote,
        JSON.stringify(selectedPaths), approvalReceipt, commitSha,
        now(), now()
      );
    },

    getGitCloseoutJob(jobId) {
      const row = db.prepare(`SELECT * FROM git_closeout_jobs WHERE job_id=?`).get(jobId);
      if (!row) return null;
      return {
        jobId: row.job_id,
        runId: row.run_id,
        projectId: row.project_id,
        status: row.status,
        mode: row.mode,
        branch: row.branch,
        remote: row.remote,
        selectedPaths: row.selected_paths_json ? JSON.parse(row.selected_paths_json) : [],
        approvalReceipt: row.approval_receipt,
        commitSha: row.commit_sha,
        beforeHeadSha: row.before_head_sha,
        attemptCount: Number(row.attempt_count),
        lastErrorCode: row.last_error_code,
        lastErrorMessage: row.last_error_message,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };
    },

    getGitCloseoutJobByRunId(runId) {
      const row = db.prepare(`SELECT * FROM git_closeout_jobs WHERE run_id=?`).get(runId);
      if (!row) return null;
      return this.getGitCloseoutJob(row.job_id);
    },

    getPendingGitCloseoutJobs() {
      const rows = db.prepare(`SELECT * FROM git_closeout_jobs WHERE status IN ('pending', 'push_failed', 'parity_failed') ORDER BY created_at ASC`).all();
      return rows.map((r) => this.getGitCloseoutJob(r.job_id));
    },

    claimGitCloseoutJob(jobId) {
      const res = db.prepare(`
        UPDATE git_closeout_jobs
        SET status = 'processing',
            attempt_count = attempt_count + 1,
            updated_at = ?
        WHERE job_id = ?
          AND status IN ('pending', 'push_failed', 'parity_failed')
      `).run(now(), jobId);

      return res.changes === 1;
    },

    updateGitCloseoutJobStatus(jobId, status, { commitSha = null, beforeHeadSha = null, errorCode = null, errorMessage = null, receipt = null } = {}) {
      const existing = this.getGitCloseoutJob(jobId);
      const shaToSet = commitSha !== null ? commitSha : (existing ? existing.commitSha : null);
      const beforeShaToSet = beforeHeadSha !== null ? beforeHeadSha : (existing ? existing.beforeHeadSha : null);

      db.prepare(`
        UPDATE git_closeout_jobs
        SET status = ?,
            commit_sha = ?,
            before_head_sha = ?,
            last_error_code = ?,
            last_error_message = ?,
            updated_at = ?
        WHERE job_id = ?
      `).run(status, shaToSet, beforeShaToSet, errorCode, errorMessage, now(), jobId);

      if (receipt) {
        this.recordGitCloseoutReceipt(existing ? existing.runId : jobId, receipt);
      }
    },

    recordGitCloseoutReceipt(runId, receipt) {
      const run = db.prepare(`SELECT project_id FROM runs WHERE run_id=?`).get(runId);
      const projectId = receipt.projectId || (run ? run.project_id : 'unknown');

      db.prepare(`
        INSERT INTO git_closeout_receipts(receipt_id, run_id, project_id, mode, push_status, parity, status, receipt_json, created_at)
        VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(receipt_id) DO UPDATE SET status=excluded.status, receipt_json=excluded.receipt_json, created_at=excluded.created_at
      `).run(
        receipt.receiptId || `git-receipt-${runId}`, runId, projectId,
        receipt.mode || receipt.requestedMode || 'commit',
        receipt.pushStatus || receipt.status || 'completed',
        receipt.parity || 'synced',
        receipt.status || 'completed',
        JSON.stringify(receipt),
        now()
      );
    },

    getGitCloseoutReceipt(runId) {
      const row = db.prepare(`SELECT * FROM git_closeout_receipts WHERE run_id=?`).get(runId);
      if (!row) return null;
      return {
        receiptId: row.receipt_id,
        runId: row.run_id,
        projectId: row.project_id,
        mode: row.mode,
        pushStatus: row.push_status,
        parity: row.parity,
        status: row.status,
        receiptJson: row.receipt_json ? JSON.parse(row.receipt_json) : null,
        createdAt: row.created_at,
      };
    },
  };
}
