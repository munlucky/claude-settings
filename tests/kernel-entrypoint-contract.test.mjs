import assert from 'node:assert/strict'; import {test} from 'node:test'; import {routeTask} from '../scripts/kernel/route.mjs';
test('wrong harness rejects routing without a workflow',()=>{assert.deepEqual(routeTask({taskClass:'feature'},{activeTrack:'relay'}),{status:'wrong_harness',requestedTrack:'kernel',activeTrack:'relay',route:[]});});
test('low-risk task uses the fast path',()=>{assert.deepEqual(routeTask({taskClass:'feature',behaviorChanging:false},{activeTrack:'kernel'}).route,['FRAME','EXECUTE','PROVE','CLOSE']);});
