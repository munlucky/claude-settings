import assert from 'node:assert/strict'; import {readFile} from 'node:fs/promises'; import {test} from 'node:test';
const corpus=JSON.parse(await readFile(new URL('./fixtures/kernel-eval/corpus.json',import.meta.url),'utf8'));
test('corpus contains thirty balanced representative cases',()=>{assert.ok(corpus.cases.length>=30); const counts=Object.groupBy(corpus.cases,(x)=>x.taskClass); for(const c of ['analysis','bug','feature','refactor','ui','long-running']) assert.equal(counts[c].length,5);});
test('every case declares risk, route, source, and evidence',()=>{for(const c of corpus.cases){assert.match(c.id,/^KRN-EVAL-\d{3}$/); assert.ok(['T0','T1','T2','T3'].includes(c.riskTier)); assert.ok(c.expectedRoute.length>=2); assert.ok(c.requiredEvidence.length);}});
