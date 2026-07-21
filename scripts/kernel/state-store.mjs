import path from 'node:path';
import { mkdir } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { resolveKernelRuntimeHome, assertIsolatedRuntimeHomes } from './runtime-home.mjs';
export const kernelDbPath=(runtimeHome=resolveKernelRuntimeHome())=>path.join(runtimeHome,'state','runtime-state.sqlite');
export const openKernelStateStore=async({runtimeHome=resolveKernelRuntimeHome(),relayHome}={})=>{
  assertIsolatedRuntimeHomes(runtimeHome, relayHome);
  const dbPath=kernelDbPath(runtimeHome); await mkdir(path.dirname(dbPath),{recursive:true});
  const db=new DatabaseSync(dbPath);
  db.exec(`PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY,value TEXT NOT NULL); CREATE TABLE IF NOT EXISTS runs(run_id TEXT PRIMARY KEY, objective TEXT NOT NULL, state TEXT NOT NULL, status TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL); CREATE TABLE IF NOT EXISTS verifications(id INTEGER PRIMARY KEY AUTOINCREMENT, run_id TEXT NOT NULL, status TEXT NOT NULL, evidence_ref TEXT, observed_at TEXT NOT NULL);`);
  const now=()=>new Date().toISOString();
  return {
    dbPath,
    createRun({runId,objective}){ db.prepare('INSERT INTO runs(run_id,objective,state,status,revision,updated_at) VALUES(?,?,?,?,0,?)').run(runId,objective,'FRAME','active',now()); return this.getRun(runId); },
    getRun(runId){ return db.prepare('SELECT run_id as runId, objective, state, status, revision, updated_at as updatedAt FROM runs WHERE run_id=?').get(runId)||null; },
    transition(runId,state){ db.prepare('UPDATE runs SET state=?, revision=revision+1, updated_at=? WHERE run_id=?').run(state,now(),runId); return this.getRun(runId); },
    recordVerification(runId,{status,evidenceRef}){ db.prepare('INSERT INTO verifications(run_id,status,evidence_ref,observed_at) VALUES(?,?,?,?)').run(runId,status,evidenceRef||null,now()); db.prepare('UPDATE runs SET revision=revision+1, updated_at=? WHERE run_id=?').run(now(),runId); },
    assessCompletion(runId){ const run=this.getRun(runId); const verification=db.prepare('SELECT status,evidence_ref as evidenceRef,observed_at as observedAt FROM verifications WHERE run_id=? ORDER BY id DESC LIMIT 1').get(runId); const accepted=Boolean(run&&run.state==='CLOSE'&&verification?.status==='passed'&&verification.evidenceRef); const decision=accepted?'accepted':'blocked'; db.prepare('UPDATE runs SET status=?, revision=revision+1, updated_at=? WHERE run_id=?').run(accepted?'completed':'blocked',now(),runId); return {decision,run:this.getRun(runId),verification:verification||null}; },
    close(){ db.close(); }
  };
};
