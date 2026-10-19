import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startServer } from '../src/server.mjs';
import { request } from 'node:http';
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
