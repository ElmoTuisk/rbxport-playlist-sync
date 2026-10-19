import { createServer } from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { Store } from './store.mjs';
import { Bridge } from './bridge.mjs';
import { Engine } from './engine.mjs';
import { Downloads } from './downloads.mjs';
import { Spotify, Vault, Providers } from './providers.mjs';
import { firstRunSettings } from './defaults.mjs';
import { oauthPage } from './oauth-page.mjs';

const publicDir = fileURLToPath(new URL('../public/', import.meta.url));
export async function startServer({ port = 43821, dataDir = join(homedir(), '.rbxport-playlist-sync'), demo = false, spotifyClient = null } = {}) {
  await mkdir(dataDir, { recursive: true });
  const token = randomBytes(32).toString('hex');
  const store = new Store(join(dataDir, demo ? 'demo.sqlite' : 'sync.sqlite'));
  if (!store.get('settings', 'main')) store.put('settings', 'main', firstRunSettings(dataDir));
  let revision = 1; const listeners = new Set();
  let runningSync = null, hostTimer = null, hostBusy = false, shuttingDown = false, selected = null, selectionRevision = 0, hostInfo = null, closeTask = null;
  const changed = () => { revision++; for (const wake of [...listeners]) wake(); clearTimeout(hostTimer); if (!demo && !shuttingDown) hostTimer = setTimeout(() => { void syncHost().catch(() => {}); }, 150); };
  const bridge = new Bridge(changed);
  let engine;
  const downloads = new Downloads(() => engine.settings());
  const spotify = spotifyClient || new Spotify(new Vault(dataDir), `http://127.0.0.1:${port}/oauth/spotify`, new Vault(dataDir, 'spotify-auth'));
  await spotify.initialize();
  const providers = new Providers(spotify, downloads);
  engine = new Engine(store, providers, downloads, bridge, changed);
  if (demo) seedDemo(store);
  const css = await readFile(join(publicDir, 'style.css'), 'utf8');
  const state = () => ({ revision, demo, connected: bridge.connected, active: engine.active,
    links: store.all('links'), jobs: store.all('jobs').slice(-150).reverse(), runs: store.all('runs').slice(-50).reverse(), settings: engine.settings(),
    counts: store.all('rows').filter(r => r.present).reduce((out, row) => { out[row.status] = (out[row.status] || 0) + 1; return out; }, {}) });
  const panelModel = () => ({ revision, demo, connected: bridge.connected, active: engine.active, selected, selectionRevision,
    expiresAt: Date.now() + 60000, settings: engine.settings(), spotify: spotify.publicStatus(),
    links: store.all('links').filter(l => demo || !hostInfo || l.libraryId === hostInfo.libraryId).map(l => ({ ...l, name: hostInfo?.playlists.find(p => p.id === l.playlistId)?.name || l.name })),
    rows: Object.fromEntries(selected ? [[selected, engine.rows(selected)]] : []),
    jobs: store.all('jobs').filter(j => j.linkId === engine.active), playlists: hostInfo?.playlists || [] });
  async function syncHost(open = false) {
    if (demo || shuttingDown || hostBusy) return;
    hostBusy = true;
    try {
      if (!bridge.connected) await bridge.connect();
      hostInfo = await bridge.call('info');
      return await bridge.updateHost({ ...panelModel(), open }, css);
    } finally { hostBusy = false; }
  }
  function startSync(id, preview = false) {
    if (engine.active) throw Error('Another sync is running');
    const link = store.get('links', id); if (!link) throw Error('Unknown playlist link');
    if (link.retryAt > Date.now()) throw Error('Provider rate limit: try after ' + new Date(link.retryAt).toLocaleString());
    runningSync = engine.sync(id, { preview });
    void runningSync.catch(() => {}).finally(() => { runningSync = null; });
  }
  async function action(name, args = {}) {
    if (demo && !['select', 'options'].includes(name)) throw Error('Example data only');
    if (!args || typeof args !== 'object') throw Error('Invalid action');
    switch (name) {
      case 'select': if (!store.get('links', args.id)) throw Error('Unknown playlist link'); selected = args.id; selectionRevision++; changed(); break;
      case 'options': hostInfo = demo ? { libraryId: 'demo', playlists: [{ id: '1', name: 'Late night selections' }] } : await bridge.call('info'); changed(); break;
      case 'connect': await bridge.connect(); await syncHost(); changed(); break;
      case 'sync': startSync(args.id); break;
      case 'cancel': engine.cancel(); break;
      case 'automatic': engine.updateLink(args.id, { automatic: args.automatic === true }); break;
      case 'link': { const link = await engine.addLink(args); selected = link.id; selectionRevision++; hostInfo = await bridge.call('info'); startSync(link.id, true); break; }
      case 'resolve': await engine.resolveRow(args.id, args); break;
      case 'settings': engine.saveSettings(args); break;
      case 'spotify': { const url = await spotify.authorize(args.clientId); changed(); return { url }; }
      default: throw Error('Unsupported action');
    }
    return { ok: true };
  }
  bridge.onAction = async message => {
    if (!Number.isSafeInteger(message?.id) || message.id <= 0 || typeof message.action !== 'string') return;
    try { const result = await action(message.action, message.args); await syncHost(); await bridge.replyHost(message.id, result); }
    catch (error) { await bridge.replyHost(message.id, null, error.message).catch(() => {}); }
  };
  const server = createServer(async (req, res) => {
    const origin = req.headers.origin;
    const allowed = [`http://127.0.0.1:${port}`, 'http://tauri.localhost', 'https://tauri.localhost', 'tauri://localhost', 'http://localhost:1420', 'http://127.0.0.1:1420'];
    res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('Referrer-Policy', 'no-referrer'); res.setHeader('Cache-Control', 'no-store');
    const json = (value, status = 200) => { if (res.destroyed) return; res.statusCode = status; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(value)); };
    try {
      if (req.headers.host !== `127.0.0.1:${port}`) return json({ error: 'Invalid host' }, 403);
      if (origin && !allowed.includes(origin)) return json({ error: 'Origin rejected' }, 403);
      if (origin) { res.setHeader('Access-Control-Allow-Origin', origin); res.setHeader('Vary', 'Origin'); }
      if (req.method === 'OPTIONS') { res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH'); res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type'); return res.end(); }
      const url = new URL(req.url, `http://127.0.0.1:${port}`);
      if (url.pathname === '/oauth/spotify' && req.method === 'GET') {
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'self'; base-uri 'none'; frame-ancestors 'none'");
        const code = url.searchParams.get('code'), authState = url.searchParams.get('state'), denied = url.searchParams.get('error');
        if (!code && !authState && !denied) return res.end(oauthPage('start', 'This address finishes Spotify sign-in; opening it directly does not sign you in. Use the Connect button in the add-on.'));
        try {
          await spotify.callback(code, authState, denied); changed();
          return res.end(oauthPage('connected', 'Your Spotify connection has been saved.'));
        } catch (error) {
          changed(); res.statusCode = error.authKind === 'cancelled' ? 200 : 400;
          return res.end(oauthPage(error.authKind || 'error', error.message));
        }
      }
      if (!url.pathname.startsWith('/api/')) {
        const files = { '/': ['index.html', 'text/html'], '/app.js': ['app.js', 'text/javascript'], '/panel.mjs': ['panel.mjs', 'text/javascript'], '/style.css': ['style.css', 'text/css'], '/oauth.css': ['oauth.css', 'text/css'] };
        if (req.method !== 'GET' || !files[url.pathname]) return json({ error: 'Not found' }, 404);
        res.setHeader('Content-Security-Policy', `default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'self' http://tauri.localhost https://tauri.localhost tauri://localhost http://localhost:1420 http://127.0.0.1:1420; base-uri 'none'; form-action 'none'`);
        const [file, mime] = files[url.pathname]; res.setHeader('Content-Type', `${mime}; charset=utf-8`); return res.end(await readFile(join(publicDir, file)));
      }
      const given = Buffer.from(req.headers.authorization?.replace(/^Bearer /, '') || ''); const expected = Buffer.from(token);
      if (given.length !== expected.length || !timingSafeEqual(given, expected)) return json({ error: 'Pairing code missing or expired. Open the launcher link again.' }, 401);
      let body = {};
      if (['POST', 'PATCH'].includes(req.method)) {
        if (!req.headers['content-type']?.startsWith('application/json')) return json({ error: 'JSON required' }, 415);
        let raw = ''; for await (const chunk of req) { raw += chunk; if (raw.length > 2 * 1024 * 1024) throw new Error('Request too large'); }
        body = raw ? JSON.parse(raw) : {};
      }
      if (req.method === 'GET' && url.pathname === '/api/state') return json(state());
      if (req.method === 'GET' && url.pathname === '/api/panel') return json(panelModel());
      if (req.method === 'POST' && url.pathname === '/api/action') return json(await action(body.action, body.args));
      if (req.method === 'GET' && url.pathname === '/api/events') {
        if (Number(url.searchParams.get('after')) !== revision) return json({ revision });
        if (listeners.size >= 12) return json({ error: 'Too many listeners' }, 429);
        const finish = () => { clearTimeout(timer); listeners.delete(finish); json({ revision }); };
        const timer = setTimeout(finish, 25000); listeners.add(finish);
        res.on('close', () => { clearTimeout(timer); listeners.delete(finish); }); return;
      }
      if (req.method === 'GET' && url.pathname === '/api/rows') return json(engine.rows(url.searchParams.get('link')));
      if (req.method === 'GET' && url.pathname === '/api/info') return json(demo ? { libraryId: 'demo', playlists: [{ id: '1', name: 'Late night selections' }] } : await bridge.call('info'));
      if (req.method === 'GET' && url.pathname === '/api/health') return json(await downloads.health());
      if (demo) return json({ error: 'Preview data only. Start without --demo to connect accounts and sync.' }, 409);
      if (req.method === 'POST' && url.pathname === '/api/shutdown') { json({ ok: true }); setImmediate(() => { void close(); }); return; }
      if (req.method === 'POST' && url.pathname === '/api/ui/open') { const result = await syncHost(true); if (!result) throw Error('Connecting to rbxport; try again in a moment.'); return json(result); }
      if (req.method === 'POST' && url.pathname === '/api/bridge/connect') return json(await bridge.connect());
      if (req.method === 'PATCH' && url.pathname === '/api/settings') return json(engine.saveSettings(body));
      if (req.method === 'POST' && url.pathname === '/api/spotify/connect') { const url = await spotify.authorize(body.clientId); changed(); return json({ url }); }
      if (req.method === 'POST' && url.pathname === '/api/links') return json(await engine.addLink(body));
      if (req.method === 'PATCH' && url.pathname === '/api/link') return json(engine.updateLink(body.id, body));
      if (req.method === 'POST' && url.pathname === '/api/sync') {
        if (engine.active) throw new Error('Another sync is running');
        const link = store.get('links', body.id);
        if (!link) throw new Error('Unknown link');
        if (link.retryAt > Date.now()) throw new Error('Provider rate limit: try after ' + new Date(link.retryAt).toLocaleString());
        runningSync = engine.sync(body.id, { preview: body.preview === true });
        void runningSync.catch(() => {}).finally(() => { runningSync = null; });
        return json({ started: true });
      }
      if (req.method === 'POST' && url.pathname === '/api/cancel') { engine.cancel(); return json({ ok: true }); }
      if (req.method === 'POST' && url.pathname === '/api/resolve') { await engine.resolveRow(body.id, body); return json({ ok: true }); }
      return json({ error: 'Not found' }, 404);
    } catch (error) { json({ error: error.message || 'Request failed' }, 400); }
  });
  server.requestTimeout = 30000; server.headersTimeout = 10000;
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
  port = server.address().port;
  spotify.redirectUri = `http://127.0.0.1:${port}/oauth/spotify`;
  await writeFile(join(dataDir, 'launch-url.txt'), `http://127.0.0.1:${port}/#${token}`, { mode: 0o600 });
  const heartbeat = !demo ? setInterval(() => { void syncHost().catch(() => {}); }, 20000) : null;
  heartbeat?.unref();
  if (!demo) void syncHost().catch(() => {});
  engine.schedule();
  function close() {
    closeTask ??= (async () => {
      shuttingDown = true; clearTimeout(hostTimer); clearInterval(heartbeat); engine.close();
      if (bridge.connected) await bridge.removeHost().catch(() => {});
      bridge.close(); for (const wake of [...listeners]) wake(); server.closeAllConnections();
      await new Promise(resolve => server.close(resolve)); await runningSync?.catch(() => {});
      while (engine.active) await new Promise(resolve => setTimeout(resolve, 25)); store.close();
    })();
    return closeTask;
  }
  return { server, engine, store, bridge, token, url: `http://127.0.0.1:${port}/#${token}`, close };
}

function seedDemo(store) {
  if (store.all('links').length) return;
  const link = { id: 'demo-link', name: 'Late night selections', sourceName: 'After hours / October', provider: 'spotify', url: 'https://open.spotify.com/', playlistId: '1', libraryId: 'demo', automatic: false, status: 'attention', message: 'Example data — no accounts connected', lastSync: Date.now() - 360000, intervalMinutes: 60 };
  store.put('links', link.id, link);
  const examples = [
    ['Night Signals', 'Mira Vale', 'ready', 'Existing 320 kbps MP3 linked', 361],
    ['Glasshouse (Extended Mix)', 'North Assembly', 'matched', 'Found in your collection', 423],
    ['Blue Hour', 'Solenne', 'review', 'YouTube candidate is Opus at 128 kbps; strict quality requirement not met', 286],
    ['Low Tide', 'Orion Park', 'review', 'Candidate differs by 27 seconds; possible video intro', 314],
    ['Transit Dub', 'Field Theory', 'missing_file', 'Matching file is on an unavailable drive', 407],
    ['First Light', 'Vela', 'missing', 'No confident match in your library', 302],
  ];
  for (const [i, [title, artist, status, reason, duration]] of examples.entries()) store.put('rows', `demo-${i}`, { id: `demo-${i}`, linkId: link.id, present: true, status, reason, candidates: [], track: { key: `demo:${i}`, title, artist, duration, url: 'https://open.spotify.com/' } });
  store.put('jobs', 'demo-job', { id: 'demo-job', title: 'Blue Hour', artist: 'Solenne', status: 'review', message: 'No 320 kbps MP3 or lossless source available. Supply an original file.', updated: Date.now() - 360000 });
  store.put('runs', 'demo-run', { id: 'demo-run', linkId: link.id, started: Date.now() - 420000, finished: Date.now() - 360000, status: 'complete', ready: 2, attention: 4 });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const option = name => { const index = process.argv.indexOf(name); return index >= 0 ? process.argv[index + 1] : undefined; };
  const app = await startServer({ ...(option('--data-dir') ? { dataDir: resolve(option('--data-dir')) } : {}), demo: process.argv.includes('--demo') });
  console.log(`Playlist Sync running on http://127.0.0.1:43821. Open the URL in ${join(option('--data-dir') || join(homedir(), '.rbxport-playlist-sync'), 'launch-url.txt')}`);
  for (const event of ['SIGINT', 'SIGTERM']) process.once(event, () => { void app.close().then(() => process.exit(0)); });
}
