import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Store } from '../src/store.mjs';
import { Engine } from '../src/engine.mjs';

async function fixture(t) {
  const dir = await mkdtemp(join(tmpdir(), 'playlist-sync-test-')); const path = join(dir, 'audio.mp3'); await writeFile(path, 'fixture');
  const store = new Store(join(dir, 'state.sqlite'));
  const tracks = ['a', 'b', 'x', 'y'].map(id => ({ id, title: id, artist: 'Artist', duration: 200, path }));
  const target = ['x', 'a', 'y', 'b']; let remote = ['b', 'a']; let imported = false; let analysisFails = false;
  const calls = []; const views = new Map();
  const bridge = { connected: true, async call(method, args = {}) {
    calls.push(method);
    if (method === 'info') return { libraryId: 'test', playlists: [{ id: 'target', name: 'Test' }] };
    if (method === 'open') { const viewId = String(views.size); const list = args.playlistId ? target.map(id => tracks.find(t => t.id === id)) : [...tracks]; views.set(viewId, list); return { libraryId: 'test', len: list.length, viewId, playlists: [{ id: 'target' }] }; }
    if (method === 'page') return views.get(args.viewId).slice(args.offset, args.offset + args.count).map(t => ({ ...t }));
    if (method === 'track') { const track=tracks.find(t=>t.id===args.id);if(!track)throw Error('Track not found');return {...track}; }
    if (method === 'add') { for (const id of args.ids) if (!target.includes(id)) target.push(id); return; }
    if (method === 'reorder') { assert.deepEqual(args.expectedIds, target); target.splice(0, target.length, ...args.ids); return; }
    if (method === 'import') { const item = { id: 'new', path }; if (!imported) { tracks.push({ ...item, title: 'new', artist: 'Artist', duration: 200 }); imported = true; return { tracks: [item], existing: [], skipped: [] }; } return { tracks: [], existing: [item], skipped: [] }; }
    if (method === 'analyse') { if (analysisFails) throw new Error('Temporary analysis failure'); return; }
    throw Error(method);
  } };
  const providers = { async playlist() { if (remote === null) throw new Error('Partial source'); return { name: 'Test', revision: 'revision', tracks: remote.map(id => ({ key: `soundcloud:${id}`, title: id, artist: 'Artist', duration: 200 })) }; } };
  let acquisitions = 0;
  const downloads = { async acquire() { acquisitions++; return { file: path }; }, async verify() {} };
  const engine = new Engine(store, providers, downloads, bridge);
  engine.saveSettings({ musicFolder: dir });
  const link = await engine.addLink({ url: 'https://soundcloud.com/artist/sets/list', playlistId: 'target' });
  t.after(async () => { engine.close(); store.close(); await rm(dir, { recursive: true, force: true }); });
  return { engine, store, link, calls, target, tracks,path,bridge,downloads, remote: value => { remote = value; }, failAnalysis: value => { analysisFails = value; }, acquisitions: () => acquisitions };
}
test('preview is read-only; sync follows source order and retains extras; repeat is idempotent', async t => {
  const f = await fixture(t); const before = [...f.target];
  assert.equal((await f.engine.sync(f.link.id, { preview: true })).status, 'complete');
  assert.deepEqual(f.target, before); assert.equal(f.calls.includes('add'), false);
  const run = await f.engine.sync(f.link.id); assert.equal(run.extraCount, 2);
  assert.deepEqual(f.target, ['b', 'a', 'x', 'y']); assert.equal(f.acquisitions(), 0);
  await f.engine.sync(f.link.id); assert.equal(f.calls.filter(m => m === 'reorder').length, 1);
  f.remote(['a']); await f.engine.sync(f.link.id); assert.deepEqual(f.target, ['a', 'b', 'x', 'y']);
});
test('partial source response retains the previous snapshot and never writes library', async t => {
  const f = await fixture(t); await f.engine.sync(f.link.id, { preview: true }); const before = f.engine.rows(f.link.id);
  f.remote(null); const run = await f.engine.sync(f.link.id);
  assert.equal(run.status, 'failed'); assert.deepEqual(f.engine.rows(f.link.id), before); assert.equal(f.calls.includes('add'), false);
});

test('cached library recheck needs no provider request and never writes playlist entries', async t => {
  const f = await fixture(t);
  await f.engine.sync(f.link.id, {preview:true});
  f.remote(null);
  const before = [...f.target];
  const run = await f.engine.sync(f.link.id, {preview:true,cached:true});
  assert.equal(run.status, 'complete');
  assert.deepEqual(f.target, before);
  assert.equal(f.calls.includes('add'), false);
  assert.match(f.store.get('links', f.link.id).message, /2 in collection/);
});

test('rechecking SoundCloud uploader tags clears stale missing/source reviews and sync reuses the playlist file',async t=>{
 const f=await fixture(t);f.remote(['a']);await f.engine.sync(f.link.id,{preview:true});
 const local=f.tracks.find(t=>t.id==='a');local.title='Artist - Evening Song';local.artist='Fixture Label';
 const row=f.engine.rows(f.link.id)[0];f.store.put('rows',row.id,{...row,status:'review',reviewKind:'source',reason:'Previous download found no source',localId:undefined,track:{...row.track,title:local.title,provider:'soundcloud'}});
 f.remote(null);f.calls.length=0;
 assert.equal((await f.engine.sync(f.link.id,{preview:true,cached:true})).status,'complete');
 const checked=f.engine.rows(f.link.id)[0];assert.equal(checked.status,'matched');assert.equal(checked.localId,'a');assert.equal(checked.reviewKind,undefined);
 assert(!f.calls.some(c=>['add','reorder','import','analyse'].includes(c)));
 const run=await f.engine.sync(f.link.id,{cached:true});assert.equal(run.ready,1);assert.deepEqual(f.target,['a','x','y','b']);
 assert.equal(f.acquisitions(),0);assert(!f.calls.some(c=>['import','analyse'].includes(c)));
});
test('analysis failure resumes imported file without downloading again', async t => {
  const f = await fixture(t); f.remote(['new']); f.failAnalysis(true);
  assert.equal((await f.engine.sync(f.link.id)).attention, 1); assert.equal(f.acquisitions(), 1);
  f.failAnalysis(false); const run = await f.engine.sync(f.link.id);
  assert.equal(run.ready, 1); assert.equal(f.acquisitions(), 1); assert.equal(f.calls.filter(m => m === 'analyse').length, 2);
  assert.deepEqual(f.target, ['new', 'x', 'a', 'y', 'b']);
});

test('a rejected web source falls back to Soulseek while existing collection tracks are reused', async t => {
  const f = await fixture(t);f.remote(['a','new']);let attempts=0;
  f.downloads.acquire = async (track,job) => {if(!job.sourcePath)throw Object.assign(Error('No acceptable source'),{code:'QUALITY_REVIEW'});return {file:job.sourcePath};};
  f.downloads.soulseek = {enabled:true,async acquire(){attempts++;return {sourcePath:join(f.engine.settings().musicFolder,'audio.mp3')};}};
  const run = await f.engine.sync(f.link.id);
  assert.equal(run.ready,2);assert.equal(run.attention,0);assert.equal(attempts,1);
  assert.equal(f.engine.rows(f.link.id).find(r=>r.track.title==='new').status,'ready');
});

test('held Soulseek failures wait for explicit batch retry and do not bypass cancelled jobs', async t => {
  const f = await fixture(t);f.remote(['new']);let attempts=0;
  f.downloads.acquire = async () => {throw Object.assign(Error('No acceptable source'),{code:'QUALITY_REVIEW'});};
  f.downloads.soulseek = {enabled:true,async acquire(){attempts++;throw Object.assign(Error('No acceptable Soulseek source'),{code:'QUALITY_REVIEW'});}};
  await f.engine.sync(f.link.id);assert.equal(attempts,1);
  await f.engine.sync(f.link.id);assert.equal(attempts,1);
  await f.engine.sync(f.link.id,{cached:true,soulseek:true});assert.equal(attempts,2);
  const saved = f.store.all('jobs')[0];f.store.put('jobs',saved.id,{...saved,status:'cancelled',acquisition:null});
  await f.engine.sync(f.link.id);assert.equal(attempts,2);
});

test('Soulseek authentication or connection failures stop the batch before further downloads', async t => {
  const f = await fixture(t);f.remote(['new','another']);let attempts=0;
  f.downloads.acquire = async () => {throw Object.assign(Error('No acceptable source'),{code:'QUALITY_REVIEW'});};
  f.downloads.soulseek = {enabled:true,async acquire(){attempts++;throw Object.assign(Error('Check Soulseek account'),{code:'SOULSEEK_AUTH'});}};
  const run = await f.engine.sync(f.link.id);
  assert.equal(run.status,'failed');assert.equal(attempts,1);assert.equal(f.calls.includes('import'),false);
});
test('duplicate memberships are preserved and native unsafe reorder is refused', async t => {
  const f = await fixture(t); f.target.push('a'); const before = [...f.target];
  const run = await f.engine.sync(f.link.id);
  assert.equal(run.status, 'failed'); assert.match(run.message, /repeated entries/);
  assert.deepEqual(f.target, before); assert.equal(f.calls.includes('reorder'), false);
});

test('Retry missing reopens held Soulseek jobs through web discovery while respecting cancelled jobs',async t=>{
 const f=await fixture(t);f.remote(['new']);f.downloads.soulseek={enabled:true,async acquire(){throw Object.assign(Error('No peer source'),{code:'QUALITY_REVIEW'});}};
 f.downloads.acquire=async(track,job)=>{if(job.sourcePath)return{file:'fixture'};throw Object.assign(Error('No web source'),{code:'QUALITY_REVIEW'});};
 await f.engine.sync(f.link.id);assert.equal(f.store.all('jobs')[0].status,'review');
 let retries=0;f.downloads.acquire=async()=>{retries++;return{file:'fixture'};};
 const run=await f.engine.sync(f.link.id,{cached:true,retryMissing:true});assert.equal(run.ready,1);assert.equal(retries,1);
});

test('audio policy changes are explicit, persisted and reject unknown standards',async t=>{
 const f=await fixture(t);assert.equal(f.engine.settings().quality,'strict-mp3-320');
 f.engine.saveSettings({quality:'club-aac-256'});assert.equal(f.engine.settings().quality,'club-aac-256');
 assert.throws(()=>f.engine.saveSettings({quality:'upscale-anything'}),/supported audio standard/);assert.equal(f.engine.settings().quality,'club-aac-256');
});

async function bulkFixture(t){
 const f=await fixture(t);f.remote(['a','b','x']);await f.engine.sync(f.link.id,{preview:true});
 f.tracks.find(t=>t.id==='a').artist='Artist & Friend';f.tracks.find(t=>t.id==='b').duration=250;
 f.tracks.push({...f.tracks.find(t=>t.id==='x'),id:'duplicate'});f.target.push('duplicate');
 for(const row of f.engine.rows(f.link.id))f.store.put('rows',row.id,{...row,status:'review',reviewKind:'match',track:{...row.track,artist:row.track.title==='a'?'Artist, Friend':row.track.artist}});
 f.calls.length=0;return f;
}
test('bulk acceptance previews safe choices, makes alternate versions explicit and keeps ties for individual review',async t=>{
 const f=await bulkFixture(t);const plan=await f.engine.bulkMatchPlan(f.link.id);
 assert.deepEqual(plan.entries.map(e=>e.localId),['a']);assert.equal(plan.skipped,2);
 const alternate=await f.engine.bulkMatchPlan(f.link.id,{includeAlternates:true});
 assert.deepEqual(alternate.entries.map(e=>e.localId),['a','b']);assert.equal(alternate.entries[1].alternate,true);
 assert.equal(f.store.all('bindings').length,0);const result=await f.engine.acceptBulkMatches(f.link.id,plan);
 assert.equal(result.accepted,1);assert.equal(f.engine.rows(f.link.id)[0].status,'matched');assert.equal(f.engine.rows(f.link.id)[1].status,'review');
 assert.deepEqual(f.target,['a','x','y','b','duplicate']);assert.match(result.message,/Source order applied/);
 assert.equal(f.acquisitions(),0);assert(!f.calls.some(c=>['import','analyse'].includes(c)));
});

test('bulk confirmation adds existing collection matches and orders all known source songs before untouched extras',async t=>{
 const f=await bulkFixture(t);f.target.splice(f.target.indexOf('b'),1);
 const plan=await f.engine.bulkMatchPlan(f.link.id,{includeAlternates:true});
 assert.deepEqual(plan.sourceIds,['a','b']);const before=[...f.target];assert(!f.calls.includes('add'));assert(!f.calls.includes('reorder'));
 f.remote(null); // Applying the saved source order requires no network/provider request.
 const result=await f.engine.acceptBulkMatches(f.link.id,plan);
 assert.deepEqual(f.target,['a','b','x','y','duplicate']);assert.equal(result.extraCount,3);
 assert(before.every(id=>f.target.includes(id)));assert.equal(f.acquisitions(),0);assert(!f.calls.some(c=>['import','analyse'].includes(c)));
 assert.equal(f.store.all('orders').length,1);
 const repeat=await f.engine.bulkMatchPlan(f.link.id,{includeAlternates:true});assert.equal(repeat.entries.length,0);
});

test('bulk ordering retains already confirmed source songs in their source positions',async t=>{
 const f=await bulkFixture(t),row=f.engine.rows(f.link.id).find(r=>r.track.title==='b');
 await f.engine.resolveRow(row.id,{action:'match',localId:'b'});
 const plan=await f.engine.bulkMatchPlan(f.link.id);assert.deepEqual(plan.sourceIds,['a','b']);
 await f.engine.acceptBulkMatches(f.link.id,plan);assert.deepEqual(f.target,['a','b','x','y','duplicate']);
});

test('changed playlist membership invalidates bulk preview; repeated entries refuse all bulk writes',async t=>{
 const f=await bulkFixture(t),plan=await f.engine.bulkMatchPlan(f.link.id);
 f.target.reverse();await assert.rejects(f.engine.acceptBulkMatches(f.link.id,plan),/Suggestions changed/);
 f.target.push('a');const repeated=await f.engine.bulkMatchPlan(f.link.id);
 await assert.rejects(f.engine.acceptBulkMatches(f.link.id,repeated),/repeated entries/);
 assert.equal(f.store.all('bindings').length,0);assert(!f.calls.some(c=>['add','reorder'].includes(c)));
});

test('a failed host reorder does not save bulk decisions and a fresh preview can retry',async t=>{
 const f=await bulkFixture(t),plan=await f.engine.bulkMatchPlan(f.link.id),call=f.bridge.call;
 f.bridge.call=async(method,args)=>{if(method==='reorder')throw Error('Playlist changed while syncing');return call(method,args);};
 await assert.rejects(f.engine.acceptBulkMatches(f.link.id,plan),/Playlist changed/);assert.equal(f.store.all('bindings').length,0);
 f.bridge.call=call;await f.engine.acceptBulkMatches(f.link.id,await f.engine.bulkMatchPlan(f.link.id));
 assert.deepEqual(f.target,['a','x','y','b','duplicate']);
});
test('changed suggestions invalidate bulk confirmation without partially accepting any decisions',async t=>{
 const f=await bulkFixture(t),plan=await f.engine.bulkMatchPlan(f.link.id,{includeAlternates:true});
 f.tracks.find(t=>t.id==='b').duration=260;
 await assert.rejects(f.engine.acceptBulkMatches(f.link.id,plan),/Suggestions changed/);assert.equal(f.store.all('bindings').length,0);assert.equal(f.engine.active,null);
});
test('a file that disappears during bulk revalidation prevents the entire batch of decisions',async t=>{
 const f=await bulkFixture(t),plan=await f.engine.bulkMatchPlan(f.link.id,{includeAlternates:true}),call=f.bridge.call;
 f.bridge.call=async(method,args)=>method==='track'&&args.id==='b'?{path:join(f.path,'missing.mp3')}:call(method,args);
 await assert.rejects(f.engine.acceptBulkMatches(f.link.id,plan));assert.equal(f.store.all('bindings').length,0);
 assert(f.engine.rows(f.link.id).every(r=>r.status==='review'));
});
test('bulk decisions cannot run during sync or apply to a different open library',async t=>{
 const f=await bulkFixture(t),plan=await f.engine.bulkMatchPlan(f.link.id);
 f.engine.active=f.link.id;await assert.rejects(f.engine.bulkMatchPlan(f.link.id),/current sync/);await assert.rejects(f.engine.acceptBulkMatches(f.link.id,plan),/current sync/);f.engine.active=null;
 const call=f.bridge.call;f.bridge.call=async(method,args)=>method==='info'?{libraryId:'different'}:call(method,args);
 await assert.rejects(f.engine.acceptBulkMatches(f.link.id,plan),/Wrong rbxport library/);assert.equal(f.store.all('bindings').length,0);
});
