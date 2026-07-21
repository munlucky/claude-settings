import assert from 'node:assert/strict'; import {readFile} from 'node:fs/promises'; import {test} from 'node:test';
const schema=JSON.parse(await readFile(new URL('../schemas/kernel.track.schema.json',import.meta.url),'utf8'));
test('track schema is closed and distinguishes Relay and Kernel',()=>{assert.equal(schema.additionalProperties,false); assert.deepEqual(schema.properties.track.enum,['relay','kernel']); assert.equal(schema.properties.schemaVersion.const,1);});
test('wrong harness contract is present in eval corpus',async()=>{const c=JSON.parse(await readFile(new URL('./fixtures/kernel-eval/corpus.json',import.meta.url),'utf8')); assert.ok(c.cases.some((x)=>x.requiredEvidence.includes('wrong-harness-receipt')));});
