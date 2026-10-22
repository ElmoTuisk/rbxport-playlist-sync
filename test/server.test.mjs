import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startServer } from '../src/server.mjs';
import { request } from 'node:http';

test('paired uninstall requires confirmation and an idle service, then closes only the add-on',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'playlist-sync-uninstall-api-'));let launches=0,removed=0;
 const bridge={connected:false,async connect(){throw Error('No host needed for uninstall');},async removeHost(){removed++;},close(){}};
 const installation={async status(){return {canUninstall:true};},async uninstall(){launches++;return {started:true};}};
 const app=await startServer({port:0,dataDir:dir,bridgeClient:bridge,automaticSync:false,installationClient:installation});
 t.after(async()=>{app.engine.active=null;await app.close();await rm(dir,{recursive:true,force:true});});
 const origin=new URL(app.url).origin,headers={Authorization:`Bearer ${app.token}`,'Content-Type':'application/json'};
 const post=(args={},auth=true)=>fetch(origin+'/api/action',{method:'POST',headers:auth?headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'uninstall',args})});
 assert.equal((await post({confirmed:true},false)).status,401);assert.equal(launches,0);
 assert.equal((await post()).status,400);assert.equal(launches,0);
 app.engine.active='fixture';assert.equal((await post({confirmed:true})).status,400);assert.equal(launches,0);app.engine.active=null;
 assert.equal((await post({confirmed:true})).status,200);assert.equal(launches,1);
 assert.equal((await post({confirmed:true})).status,409);assert.equal(launches,1);assert.equal(removed,0);
});

test('a failed library check still attaches the sidebar, preserves links and blocks work until recovery', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'playlist-sync-unavailable-'));
  const models = [], calls = [], failure = 'This rbxport build lacks the library API required by Playlist Sync.';
  let supported = false;
  const bridge = {
    connected: false,
    async connect(options) { assert.equal(options.verifyLibrary, false); this.connected = true; },
    async call(method) {
      calls.push(method); assert.equal(method, 'info', 'No collection read or write while unsupported');
      if (!supported) throw Error(failure);
      return { libraryId: 'fixture', playlists: [{ id: 'target', name: 'Fixture' }] };
    },
    async updateHost(model) { models.push(model); return { installed: true, ready: true }; },
    async removeHost() {}, close() { this.connected = false; }
  };
  const app = await startServer({ port: 0, dataDir: dir, bridgeClient: bridge, automaticSync: false });
  t.after(async () => { await app.close(); await rm(dir, { recursive: true, force: true }); });
  const base = new URL(app.url).origin;
  const headers = { Authorization: `Bearer ${app.token}`, 'Content-Type': 'application/json' };
  const post = (path, body) => fetch(base + path, { method: 'POST', headers, body: JSON.stringify(body) });
  const connect = () => post('/api/action', { action: 'connect' });
  const link = { id: 'saved', libraryId: 'fixture', playlistId: 'target', name: 'Saved playlist', automatic: false, status: 'failed', message: 'Error: Command database_drives not found\n    at <anonymous>:1:673' };
  app.store.put('links', link.id, link);
  app.store.put('bindings', 'kept', { localId: 'existing', libraryId: 'fixture' });
  const results = await Promise.all([connect(), post('/api/ui/open', {})]);
  for (const response of results) { assert.equal(response.status, 200); const result = await response.json(); assert.equal(result.ready, true); assert.equal(result.libraryReady, false); assert.equal(result.connectionError, failure); }
  assert.equal(models.at(-1).connected, false);
  assert.equal(models.at(-1).automaticPaused, true);
  assert.equal(models.some(model => model.open), true, 'A concurrent startup must not lose the popup-open request');
  assert.equal(models.at(-1).links.length, 1);
  assert.deepEqual(app.store.get('links', link.id), link);
  assert.equal(app.store.get('bindings', 'kept').localId, 'existing');
  for (const action of ['options','sync','recheck','retry-missing','link','resolve','accept-matches','accept-quality','automatic']) {
    const response = await post('/api/action', { action, args: { id: link.id } });
    assert.equal(response.status, 400); assert.equal((await response.json()).error, failure);
  }
  for (const path of ['/api/sync','/api/links']) assert.equal((await post(path, { id: link.id })).status, 400);
  assert.equal(app.store.all('runs').length, 0); assert.equal(app.store.all('jobs').length, 0);
  app.store.put('links', link.id, { ...link, automatic: true });
  app.engine.schedule(); assert.equal(app.engine.timer, null, 'A diagnostic launch must not schedule saved automatic links');
  app.store.put('links', link.id, link);
  assert.equal((await post('/api/action', { action: 'select', args: { id: link.id } })).status, 200);
  supported = true;
  const recovered = await (await connect()).json();
  assert.equal(recovered.ready, true); assert.equal(recovered.libraryReady, true); assert.equal(recovered.connectionError, '');
  const state = await (await fetch(base + '/api/state', { headers })).json(); assert.equal(state.connected, true);
  const recoveredLink = app.store.get('links', link.id);
  assert.equal(recoveredLink.status, 'preview'); assert.match(recoveredLink.message, /connection restored/);
  assert.equal(recoveredLink.libraryId, link.libraryId); assert.equal(recoveredLink.playlistId, link.playlistId);
  supported = false;
  await connect();
  assert.equal((await (await fetch(base + '/api/state', { headers })).json()).connected, false);
  assert.deepEqual(app.store.get('links', link.id), recoveredLink, 'Losing library capability must not reconcile saved playlists as deleted');
  assert(calls.every(method => method === 'info'));
});
test('Spotisaver verification uses saved Spotify metadata and retry retains library and explicit-source guards',async t=>{
  const dir=await mkdtemp(join(tmpdir(),'playlist-sync-browser-api-'));
  let opens=0,closed=0;const calls=[];
  const wire={token_param:'token',ctx_param:'ctx',action_param:'action',sig_header:'X-Sig',exp_header:'X-Exp',actions:{get_playlist:'metadata',download_track:'download'}};
  const track={provider:'spotify',id:'a'.repeat(22),key:'spotify:'+ 'a'.repeat(22),title:'Fixture',artist:'Test',duration:200};
  const browser={connected:false,async open(){opens++;this.connected=true;},async close(){closed++;this.connected=false;},async fetch(raw){
    const path=new URL(raw).pathname;calls.push(path);
    if(path==='/')return new Response(`requestToken:"${'t'.repeat(32)}",wire:${JSON.stringify(wire)}};`);
    if(path==='/api/get_signature.php')return Response.json({success:true,token:'fixture',exp:12345});
    if(path==='/api/get_playlist.php')return Response.json({tracks:[{id:track.id,name:track.title,artists:[track.artist],duration_ms:200000}]});
    throw Error('Verification must not download audio');
  }};
  const bridge={connected:false,async connect(){this.connected=true;},async call(method){assert.equal(method,'info');return {libraryId:'fixture',playlists:[{id:'target',name:'Fixture'}]};},async updateHost(){return {ready:true};},async removeHost(){},close(){this.connected=false;}};
  const app=await startServer({port:0,dataDir:dir,bridgeClient:bridge,spotisaverBrowser:browser,automaticSync:false});
  t.after(async()=>{await app.close();await rm(dir,{recursive:true,force:true});});
  const base=new URL(app.url).origin,headers={Authorization:`Bearer ${app.token}`,'Content-Type':'application/json'};
  const post=(action,args={})=>fetch(base+'/api/action',{method:'POST',headers,body:JSON.stringify({action,args})});
  await post('connect');
  app.store.put('links','link',{id:'link',libraryId:'fixture',playlistId:'target',automatic:false});
  app.store.put('rows','row',{id:'row',linkId:'link',present:true,status:'review',track});
  assert.equal((await post('spotisaver-retry',{id:'row'})).status,400);
  assert.equal((await post('spotisaver-verify',{id:'unknown',url:'https://arbitrary.test'})).status,400);assert.equal(opens,0);
  assert.equal((await post('spotisaver-verify',{id:'row'})).status,200);
  let state;for(let i=0;i<20;i++){state=await (await fetch(base+'/api/panel',{headers})).json();if(state.spotisaver.connected)break;await new Promise(r=>setTimeout(r,10));}
  assert.equal(state.spotisaver.connected,true);assert.equal(opens,1);assert.equal(app.store.all('jobs').length,0);assert(!calls.includes('/api/download_track.php'));
  app.engine.saveSettings({spotisaverMode:'first'});let resolveCalls=0,downloadCalls=0;
  app.engine.resolveRow=async(id,value)=>{assert.equal(id,'row');assert.equal(value.action,'retry');resolveCalls++;};
  app.engine.downloadRow=async id=>{assert.equal(id,'row');downloadCalls++;};
  bridge.libraryReady=false;assert.equal((await post('spotisaver-retry',{id:'row'})).status,400);assert.equal(resolveCalls,0);bridge.libraryReady=true;
  for(const override of [{overrideUrl:'https://example.test'},{sourcePath:'fixture'},{qualityApproval:{codec:'aac'}},{originalOnly:true}]){
    app.store.put('jobs','job',{id:'job',rowId:'row',...override});assert.equal((await post('spotisaver-retry',{id:'row'})).status,400);
  }
  app.store.delete('jobs','job');assert.equal((await post('spotisaver-retry',{id:'row'})).status,200);assert.equal(resolveCalls,1);assert.equal(downloadCalls,1);
  app.engine.active='fixture';assert.equal((await post('spotisaver-check')).status,400);assert.equal((await post('spotisaver-disconnect')).status,400);app.engine.active=null;
  assert.equal((await post('spotisaver-disconnect')).status,200);assert.equal(closed,1);
});

test('local API requires pairing, rejects cross-origin requests and keeps demo read-only', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'playlist-sync-api-'));
  const app = await startServer({ port: 0, dataDir: dir, demo: true });
  t.after(async () => { await app.close(); await rm(dir, { recursive: true, force: true }); });
  const base = new URL(app.url).origin; const headers = { Authorization: `Bearer ${app.token}` };
  assert.equal((await fetch(`${base}/api/state`)).status, 401);
  assert.equal((await fetch(`${base}/api/state`, { headers })).status, 200);
  const model = await (await fetch(`${base}/api/panel`, { headers })).json();
  assert.equal(model.links.length, 1);
  assert.equal(Object.hasOwn(model, 'runs'), false);
  assert.equal(Object.hasOwn(model, 'token'), false);
  const selection = await fetch(`${base}/api/action`, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'select', args: { id: 'demo-link' } }) });
  assert.equal(selection.status, 200);
  assert.equal((await (await fetch(`${base}/api/panel`, { headers })).json()).rows['demo-link'].length, 6);
  assert.equal((await fetch(`${base}/panel.mjs`)).status, 200);
  assert.equal((await fetch(`${base}/api/state`, { headers: { ...headers, Origin: 'https://evil.test' } })).status, 403);
  const invalidHostStatus = await new Promise((resolve, reject) => {
    const req = request(`${base}/api/state`, { headers: { ...headers, Host: 'evil.test' } }, res => { res.resume(); resolve(res.statusCode); });
    req.on('error', reject); req.end();
  });
  assert.equal(invalidHostStatus, 403);
  assert.equal((await fetch(`${base}/api/sync`, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: '{}' })).status, 409);
  const html = await fetch(base); assert.match(html.headers.get('content-security-policy'), /script-src 'self'/);
  assert.equal((await fetch(`${base}/src/server.mjs`)).status, 404);
  await app.close(); await app.close(); // A stop request and process cleanup may arrive together.
});
