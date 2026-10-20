import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startServer } from '../src/server.mjs';
import { request } from 'node:http';

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
