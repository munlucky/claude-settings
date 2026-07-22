import assert from 'node:assert/strict'; import {test} from 'node:test'; import {transition,canTransition} from '../scripts/kernel/transition.mjs';
test('valid transition advances and records history',()=>{const n=transition({state:'FRAME',history:['FRAME']},'EXECUTE'); assert.equal(n.state,'EXECUTE'); assert.deepEqual(n.history,['FRAME','EXECUTE']);});
test('invalid transition is rejected',()=>{assert.equal(canTransition('FRAME','PROVE'),false); assert.throws(()=>transition({state:'FRAME',history:[]},'PROVE'));});
