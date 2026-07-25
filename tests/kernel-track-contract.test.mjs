import assert from 'node:assert/strict'; import {readFile} from 'node:fs/promises'; import {test} from 'node:test';
const schema=JSON.parse(await readFile(new URL('../schemas/kernel.track.schema.json',import.meta.url),'utf8'));
test('track schema is closed and distinguishes Relay and Kernel',()=>{assert.equal(schema.additionalProperties,false); assert.deepEqual(schema.properties.track.enum,['relay','kernel']); assert.equal(schema.properties.schemaVersion.const,1);});
test('wrong harness contract is present in eval corpus',async()=>{const c=JSON.parse(await readFile(new URL('./fixtures/kernel-eval/corpus.json',import.meta.url),'utf8')); assert.ok(c.cases.some((x)=>x.requiredEvidence.includes('wrong-harness-receipt')));});

// The switcher establishes the track process-scoped (MOON_RELAY_TRACK) instead
// of writing a marker into the workspace, so account-root installs work without
// any per-project `.moon-relay` directory.
test('active track resolves from the switcher session when no marker exists', async () => {
  const {readProjectTrack, readProjectTrackSync} = await import('../scripts/kernel/runtime-home.mjs');
  const {mkdtemp, mkdir, writeFile} = await import('node:fs/promises');
  const os = await import('node:os'); const path = await import('node:path');
  const root = await mkdtemp(path.join(os.tmpdir(), 'krn-track-'));

  assert.equal(await readProjectTrack(root, {env: {}}), null, 'nothing declares a track');
  assert.equal(await readProjectTrack(root, {env: {MOON_RELAY_TRACK: 'kernel'}}), 'kernel');
  assert.equal(await readProjectTrack(root, {env: {MOON_RELAY_TRACK: 'relay'}}), 'relay');
  assert.equal(readProjectTrackSync(root, {env: {MOON_RELAY_TRACK: 'kernel'}}), 'kernel');
  assert.equal(await readProjectTrack(root, {env: {MOON_RELAY_TRACK: 'bogus'}}), null, 'an unknown value is not a track');

  // An explicit repository declaration outranks the ambient session, so a repo
  // pinned to one track is never hijacked by a session on the other.
  await mkdir(path.join(root, '.moon-relay'), {recursive: true});
  await writeFile(path.join(root, '.moon-relay', 'track.yaml'), 'schemaVersion: 1\ntrack: relay\n');
  assert.equal(await readProjectTrack(root, {env: {MOON_RELAY_TRACK: 'kernel'}}), 'relay');
  assert.equal(readProjectTrackSync(root, {env: {MOON_RELAY_TRACK: 'kernel'}}), 'relay');
});
