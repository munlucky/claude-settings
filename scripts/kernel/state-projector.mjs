import path from 'node:path';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const digest=(v)=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
export const buildProjection=(run)=>({schemaVersion:1,runId:run.runId,runtimeRevision:run.revision,status:run.status,currentState:run.state,sourceDigest:digest(run)});
export const writeProjection=async({run,outputDir})=>{ await mkdir(outputDir,{recursive:true}); const p=buildProjection(run); await writeFile(path.join(outputDir,'run-status.json'),JSON.stringify(p,null,2)); await writeFile(path.join(outputDir,'STATE.md'),`# Kernel Run ${run.runId}\n\n- Status: ${run.status}\n- State: ${run.state}\n- Runtime revision: ${run.revision}\n- Source digest: ${p.sourceDigest}\n`); return p; };
export const verifyProjection=async({run,file})=>{ const actual=JSON.parse(await readFile(file,'utf8')); const expected=buildProjection(run); return {valid:actual.sourceDigest===expected.sourceDigest&&actual.runtimeRevision===expected.runtimeRevision&&actual.status===expected.status&&actual.currentState===expected.currentState&&actual.runId===expected.runId,actual,expected}; };
