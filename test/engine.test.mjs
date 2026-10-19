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
  return { engine, store, link, calls, target, downloads, remote: value => { remote = value; }, failAnalysis: value => { analysisFails = value; }, acquisitions: () => acquisitions };
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
