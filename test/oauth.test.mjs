import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Spotify, Vault } from '../src/providers.mjs';
import { startServer } from '../src/server.mjs';

const clientId = 'a'.repeat(32), redirect = 'http://127.0.0.1:43821/oauth/spotify';
const memoryVault = () => ({ value: null, async read() { return structuredClone(this.value); }, async write(value) { this.value = structuredClone(value); } });
const fixture = () => {
  const tokens = memoryVault(), flows = memoryVault(), spotify = new Spotify(tokens, redirect, flows);
  spotify.tokenRequest = async () => ({ access_token: 'fixture-access', refresh_token: 'fixture-refresh', expires_in: 3600 });
  return { tokens, flows, spotify };
};
const stateOf = url => new URL(url).searchParams.get('state');

test('PKCE sign-in is persisted before navigation and resumes after restarting', async () => {
  const { tokens, flows, spotify } = fixture();
  const url = new URL(await spotify.authorize(` ${clientId} `));
  const state = url.searchParams.get('state'), saved = flows.value.pending[state];
  assert.equal(url.searchParams.get('code_challenge'), createHash('sha256').update(saved.verifier).digest('base64url'));
  assert.equal(url.searchParams.get('redirect_uri'), redirect);
  const restarted = new Spotify(tokens, redirect, flows);
  restarted.tokenRequest = async params => {
    assert.equal(params.code_verifier, saved.verifier); assert.equal(params.redirect_uri, redirect);
    return { access_token: 'fixture-access', refresh_token: 'fixture-refresh', expires_in: 3600 };
  };
  await restarted.callback('fixture-code', state);
  assert.equal(restarted.publicStatus().connected, true);
  assert.equal(restarted.publicStatus().clientId, clientId);
  assert.equal(Object.keys(flows.value.pending).length, 0);
  assert.equal(JSON.stringify(restarted.publicStatus()).includes(saved.verifier), false);
});

test('an invalid state cannot connect Spotify or consume a valid sign-in', async () => {
  const { spotify, tokens } = fixture(); const state = stateOf(await spotify.authorize(clientId));
  await assert.rejects(spotify.callback('fixture-code', 'wrong-state'), e => e.authKind === 'expired');
  assert.equal(tokens.value, null); assert.equal(spotify.pending.has(state), true);
  await spotify.callback('fixture-code', state); assert.equal(spotify.publicStatus().connected, true);
});

test('a callback without a code does not destroy an in-progress attempt', async () => {
  const { spotify } = fixture(); const state = stateOf(await spotify.authorize(clientId));
  await assert.rejects(spotify.callback(null, state), e => e.authKind === 'incomplete');
  assert.equal(spotify.pending.has(state), true);
  await spotify.callback('fixture-code', state);
});

test('expired attempts remain rejected after restart', async () => {
  const { spotify, tokens, flows } = fixture(); const state = stateOf(await spotify.authorize(clientId));
  flows.value.pending[state].expires = Date.now() - 1000;
  const restarted = new Spotify(tokens, redirect, flows);
  await assert.rejects(restarted.callback('fixture-code', state), e => e.authKind === 'expired');
  assert.equal(tokens.value, null);
});

test('Windows encrypted stores resume a pending sign-in with fresh credential-store instances', { skip: process.platform !== 'win32' }, async t => {
  const dir = await mkdtemp(join(tmpdir(), 'playlist-sync-dpapi-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const first = new Spotify(new Vault(dir), redirect, new Vault(dir, 'spotify-auth'));
  const state = stateOf(await first.authorize(clientId));
  const encrypted = await readFile(join(dir, 'spotify-auth.dpapi'), 'utf8');
  assert.equal(encrypted.includes(clientId), false); assert.equal(encrypted.includes(state), false);
  const restarted = new Spotify(new Vault(dir), redirect, new Vault(dir, 'spotify-auth'));
  restarted.tokenRequest = async () => ({ access_token: 'fixture-access', refresh_token: 'fixture-refresh', expires_in: 3600 });
  await restarted.callback('fixture-code', state);
  const restored = new Spotify(new Vault(dir), redirect, new Vault(dir, 'spotify-auth'));
  await restored.initialize(); assert.equal(restored.publicStatus().connected, true);
  assert.equal(restored.publicStatus().clientId, clientId);
});

test('duplicate callbacks and refreshing a successful callback exchange the code only once', async () => {
  const { spotify, tokens, flows } = fixture(); const state = stateOf(await spotify.authorize(clientId));
  let exchanges = 0;
  spotify.tokenRequest = async () => { exchanges++; await new Promise(r => setTimeout(r, 10)); return { access_token: 'fixture-access', refresh_token: 'fixture-refresh', expires_in: 3600 }; };
  await Promise.all([spotify.callback('fixture-code', state), spotify.callback('fixture-code', state)]);
  await spotify.callback('fixture-code', state); assert.equal(exchanges, 1);
  const restarted = new Spotify(tokens, redirect, flows);
  restarted.tokenRequest = () => { throw Error('Must not exchange a used code again'); };
  assert.equal((await restarted.callback('fixture-code', state)).connected, true);
});

test('cancelled authorization reports cancellation without saving credentials', async () => {
  const { spotify, tokens } = fixture(); const state = stateOf(await spotify.authorize(clientId));
  await assert.rejects(spotify.callback(null, state, 'access_denied'), e => e.authKind === 'cancelled' && /cancelled/.test(e.message));
  assert.equal(tokens.value, null); assert.equal(spotify.publicStatus().connected, false);
  assert.equal(spotify.publicStatus().status, 'disconnected');
});

test('invalid Client ID responses have a useful setup error', async t => {
  const spotify = new Spotify(memoryVault(), redirect);
  t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({ error: 'invalid_client' }), { status: 401 }));
  await assert.rejects(spotify.tokenRequest({ grant_type: 'authorization_code' }), e => e.authKind === 'client' && /Client ID/.test(e.message));
});

test('an incomplete token response cannot report a successful connection', async () => {
  const { spotify, tokens } = fixture(); const state = stateOf(await spotify.authorize(clientId));
  spotify.tokenRequest = async () => ({ expires_in: 3600 });
  await assert.rejects(spotify.callback('fixture-code', state), /incomplete/);
  assert.equal(tokens.value, null); assert.equal(spotify.publicStatus().connected, false);
});

test('the callback serves friendly HTML for bare, invalid, denied, successful and repeated visits', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'playlist-sync-oauth-'));
  const { spotify } = fixture();
  const app = await startServer({ port: 0, dataDir: dir, demo: true, spotifyClient: spotify });
  t.after(async () => { await app.close(); await rm(dir, { recursive: true, force: true }); });
  const base = new URL(app.url).origin;
  let response = await fetch(`${base}/oauth/spotify`);
  assert.equal(response.status, 200); assert.match(response.headers.get('content-type'), /text\/html/);
  assert.match(await response.text(), /Start from Playlist sync/);
  response = await fetch(`${base}/oauth/spotify?code=fixture-code&state=wrong`);
  assert.equal(response.status, 400); assert.match(response.headers.get('content-type'), /text\/html/);
  assert.match(await response.text(), /Spotify sign-in not completed/);
  let state = stateOf(await spotify.authorize(clientId));
  response = await fetch(`${base}/oauth/spotify?error=access_denied&state=${state}`);
  assert.equal(response.status, 200); assert.match(await response.text(), /Sign-in cancelled/);
  state = stateOf(await spotify.authorize(clientId));
  for (let index = 0; index < 2; index++) {
    response = await fetch(`${base}/oauth/spotify?code=fixture-code&state=${state}`);
    const html = await response.text(); assert.equal(response.status, 200); assert.match(html, /Spotify connected/);
    assert.equal(html.includes('fixture-access'), false); assert.equal(html.includes(state), false);
  }
  const model = await (await fetch(`${base}/api/panel`, { headers: { Authorization: `Bearer ${app.token}` } })).json();
  assert.equal(model.spotify.connected, true); assert.equal(model.spotify.clientId, clientId);
});
