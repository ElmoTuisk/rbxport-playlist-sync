import { randomBytes, createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { run } from './process.mjs';

function authError(kind, message) { return Object.assign(new Error(message), { authKind: kind }); }

export function playlistReference(raw) {
  const url = new URL(raw);
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error('Use an HTTPS playlist URL.');
  if (url.hostname === 'open.spotify.com') {
    const id = url.pathname.match(/^(?:\/intl-[a-z]+)?\/playlist\/([a-zA-Z0-9]+)\/?$/)?.[1];
    if (!id) throw new Error('Use a Spotify playlist link.');
    return { provider: 'spotify', id, url: `https://open.spotify.com/playlist/${id}` };
  }
  if (['soundcloud.com', 'www.soundcloud.com'].includes(url.hostname) && /^\/[^/]+\/sets\/[^/]+\/?$/.test(url.pathname))
    return { provider: 'soundcloud', id: url.pathname, url: `https://soundcloud.com${url.pathname}${url.search}` };
  throw new Error('Use a Spotify playlist or SoundCloud /sets/ link.');
}

export function mediaUrl(raw) {
  const url = new URL(raw);
  if (url.protocol !== 'https:' || url.username || url.password || url.port) throw new Error('Invalid media URL.');
  if (['www.newgrounds.com','newgrounds.com'].includes(url.hostname) && /^\/audio\/listen\/\d+\/?$/.test(url.pathname)) return url.href;
  if (!['www.youtube.com', 'youtube.com', 'music.youtube.com', 'youtu.be', 'soundcloud.com', 'www.soundcloud.com'].includes(url.hostname))
    throw new Error('Only YouTube and SoundCloud media URLs are supported.');
  return url.href;
}

export class Vault {
  constructor(directory, name = 'spotify') {
    if (!/^[a-z-]+$/.test(name)) throw new Error('Invalid credential store name');
    this.path = join(directory, `${name}.dpapi`); this.memory = null;
  }
  async read() {
    if (this.memory) return this.memory;
    if (process.platform !== 'win32') return null;
    try {
      const encrypted = await readFile(this.path, 'utf8');
      const script = "Add-Type -AssemblyName System.Security; $bytes=[Convert]::FromBase64String([Console]::In.ReadToEnd()); [Text.Encoding]::UTF8.GetString([Security.Cryptography.ProtectedData]::Unprotect($bytes,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser))";
      this.memory = JSON.parse(await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { input: encrypted }));
      return this.memory;
    } catch (error) { if (error.code === 'ENOENT') return null; throw new Error('Cannot unlock saved Spotify credentials. Reconnect Spotify.'); }
  }
  async write(value) {
    if (process.platform !== 'win32') { this.memory = value; return; }
    const script = "Add-Type -AssemblyName System.Security; $bytes=[Text.Encoding]::UTF8.GetBytes([Console]::In.ReadToEnd()); [Convert]::ToBase64String([Security.Cryptography.ProtectedData]::Protect($bytes,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser))";
    const encrypted = await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { input: JSON.stringify(value) });
    await writeFile(this.path, encrypted.trim(), { mode: 0o600 }); this.memory = value;
  }
}

export class Spotify {
  constructor(vault, redirectUri, authStore = null) {
    Object.assign(this, { vault, redirectUri, authStore });
    this.pending = new Map(); this.completed = new Map(); this.exchanges = new Map(); this.refreshing = null;
    this.clientId = ''; this.connected = false; this.message = ''; this.loading = null; this.saving = Promise.resolve();
  }
  async initialize() {
    this.loading ??= (async () => {
      let saved = {}, token;
      try { saved = await this.authStore?.read() || {}; } catch { this.message = 'Previous sign-in could not be restored. Connect again.'; }
      try { token = await this.vault.read(); } catch (error) { this.message = error.message; }
      this.clientId = saved.clientId || token?.clientId || '';
      this.connected = Boolean(token?.access_token && (token.refresh_token || token.expiresAt > Date.now()));
      for (const [state, value] of Object.entries(saved.pending || {})) {
        if (/^[a-f0-9]{48}$/.test(state) && value.expires > Date.now() && value.redirectUri === this.redirectUri && /^[A-Za-z0-9_-]{43,128}$/.test(value.verifier || '')) this.pending.set(state, value);
      }
      for (const [state, value] of Object.entries(saved.completed || {})) if (/^[a-f0-9]{48}$/.test(state) && value.expires > Date.now()) this.completed.set(state, value);
    })();
    await this.loading;
  }
  publicStatus() {
    const waiting = [...this.pending.values()].some(v => v.expires > Date.now());
    return { clientId: this.clientId, connected: this.connected, status: waiting ? 'waiting' : this.connected ? 'connected' : 'disconnected',
      message: waiting ? 'Finish signing in in your browser.' : this.message };
  }
  persist() {
    if (!this.authStore) return Promise.resolve();
    this.saving = this.saving.catch(() => {}).then(() => this.authStore.write({ clientId: this.clientId,
      pending: Object.fromEntries(this.pending), completed: Object.fromEntries(this.completed) }));
    return this.saving;
  }
  async authorize(clientId) {
    await this.initialize();
    clientId = String(clientId || this.clientId).trim();
    if (!/^[a-zA-Z0-9]{20,64}$/.test(clientId)) throw new Error('Enter your Spotify application Client ID.');
    const state = randomBytes(24).toString('hex'), verifier = randomBytes(48).toString('base64url');
    for (const [key, val] of this.pending) if (val.expires < Date.now()) this.pending.delete(key);
    for (const [key, val] of this.completed) if (val.expires < Date.now()) this.completed.delete(key);
    while (this.pending.size >= 8) this.pending.delete(this.pending.keys().next().value);
    this.clientId = clientId; this.message = '';
    this.pending.set(state, { verifier, clientId, redirectUri: this.redirectUri, expires: Date.now() + 600000 });
    await this.persist(); // Persist the verifier before opening Spotify; restarting must not lose it.
    const params = new URLSearchParams({ client_id: clientId, response_type: 'code', redirect_uri: this.redirectUri,
      state, scope: 'playlist-read-private playlist-read-collaborative', code_challenge_method: 'S256',
      code_challenge: createHash('sha256').update(verifier).digest('base64url') });
    return `https://accounts.spotify.com/authorize?${params}`;
  }
  async tokenRequest(params) {
    const response = await fetch('https://accounts.spotify.com/api/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(params), signal: AbortSignal.timeout(30000) });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      if (body.error === 'invalid_client') throw authError('client', 'Spotify did not recognize the Client ID. Check the Client ID in Playlist sync settings.');
      if (body.error === 'invalid_grant') throw authError('expired', params.grant_type === 'refresh_token' ? 'Your Spotify session expired. Connect Spotify again.' : 'This Spotify sign-in code expired or was already used. Connect again from Playlist sync.');
      throw authError('provider', `Spotify could not finish sign-in (${response.status}). Check the app Client ID and exact redirect URI, then connect again.`);
    }
    return response.json();
  }
  async callback(code, state, providerError = null) {
    await this.initialize();
    if (this.exchanges.has(state)) return this.exchanges.get(state);
    const done = this.completed.get(state);
    if (done?.expires > Date.now()) {
      if (done.kind === 'connected' && this.connected) return { connected: true, repeated: true };
      if (done.kind === 'connected') throw authError('expired', 'The saved Spotify connection is no longer available. Connect again from Playlist sync.');
      throw authError(done.kind, done.message);
    }
    const pending = this.pending.get(state);
    if (!pending || pending.expires < Date.now()) throw authError('expired', 'This sign-in attempt expired or is no longer available. In rbxport, open Playlist sync → Settings → Connect Spotify and try again.');
    if (providerError) {
      const message = providerError === 'access_denied' ? 'Spotify sign-in was cancelled. You can connect again whenever you are ready.' : 'Spotify could not authorize this app. Check its settings and try Connect again.';
      this.pending.delete(state); this.message = message;
      this.completed.set(state, { kind: 'cancelled', message, expires: Date.now() + 3600000 }); await this.persist();
      throw authError('cancelled', message);
    }
    if (!code) throw authError('incomplete', 'Spotify did not return a sign-in code. Use Connect Spotify in Playlist sync instead of opening the redirect address directly.');
    const exchange = (async () => {
      try {
        const token = await this.tokenRequest({ grant_type: 'authorization_code', code, client_id: pending.clientId, redirect_uri: pending.redirectUri, code_verifier: pending.verifier });
        if (!token.access_token || !Number.isFinite(token.expires_in) || token.expires_in <= 0) throw authError('provider', 'Spotify returned an incomplete sign-in response. Connect again.');
        await this.vault.write({ ...token, clientId: pending.clientId, expiresAt: Date.now() + token.expires_in * 1000 });
        this.connected = true; this.clientId = pending.clientId; this.message = 'Spotify connected.';
        this.completed.set(state, { kind: 'connected', expires: Date.now() + 3600000 });
        return { connected: true };
      } catch (error) {
        this.message = error.message;
        this.completed.set(state, { kind: error.authKind || 'provider', message: error.message, expires: Date.now() + 3600000 });
        throw error;
      } finally { this.pending.delete(state); await this.persist(); }
    })();
    this.exchanges.set(state, exchange);
    try { return await exchange; } finally { this.exchanges.delete(state); }
  }
  async access() {
    await this.initialize();
    const value = await this.vault.read();
    if (!value) throw new Error('Connect Spotify in Settings.');
    if (value.expiresAt > Date.now() + 60000) return value.access_token;
    this.refreshing ??= (async () => {
      const token = await this.tokenRequest({ grant_type: 'refresh_token', refresh_token: value.refresh_token, client_id: value.clientId });
      await this.vault.write({ ...value, ...token, expiresAt: Date.now() + token.expires_in * 1000 });
      return token.access_token;
    })().finally(() => { this.refreshing = null; });
    return this.refreshing;
  }
  async get(path) {
    const url = new URL(path, 'https://api.spotify.com');
    if (url.origin !== 'https://api.spotify.com' || !url.pathname.startsWith('/v1/')) throw new Error('Invalid Spotify API pagination URL');
    const response = await fetch(url, { headers: { Authorization: `Bearer ${await this.access()}` }, signal: AbortSignal.timeout(30000) });
    if (response.status === 403) throw Object.assign(new Error('Spotify denied playlist access. You must own or collaborate on it, and your account must be allowed by the app.'),{httpStatus:403});
    if (response.status === 401) throw new Error('Spotify session expired. Reconnect in Settings.');
    if (response.status === 429) {
      const seconds = Math.max(60, Number(response.headers.get('retry-after')) || 3600);
      const error = new Error(`Spotify rate/quota limit. Paused for at least ${Math.ceil(seconds / 60)} minutes.`);
      error.retryAt = Date.now() + seconds * 1000; throw error;
    }
    if (!response.ok) throw Object.assign(new Error(`Spotify request failed (${response.status}); previous snapshot retained.`),{httpStatus:response.status});
    return response.json();
  }
  async playlist(ref) {
    const before = await this.get(`/v1/playlists/${ref.id}?fields=id,name,snapshot_id`);
    const tracks = []; let next = `/v1/playlists/${ref.id}/items?limit=50`; let pages = 0;
    while (next) {
      if (++pages > 1000) throw new Error('Playlist pagination limit exceeded');
      const page = await this.get(next);
      if (!Array.isArray(page.items)) throw new Error('Incomplete Spotify response; previous snapshot retained.');
      for (const [index, entry] of page.items.entries()) {
        const track = entry.item || entry.track;
        tracks.push(track?.id && track.type === 'track' && !entry.is_local ? {
          key: `spotify:${track.id}`, provider: 'spotify', id: track.id, title: track.name,
          artist: track.artists?.map(a => a.name).join(', ') || '', duration: track.duration_ms / 1000,
          isrc: track.external_ids?.isrc || '', url: `https://open.spotify.com/track/${track.id}`, explicit: track.explicit,
        } : { key: `unavailable:${pages}:${index}`, title: track?.name || 'Unavailable or local Spotify item', artist: '', unavailable: true, duration: 0 });
      }
      next = page.next;
      if (!next && Number.isFinite(page.total) && tracks.length !== page.total) throw new Error('Incomplete playlist; previous snapshot retained.');
    }
    const after = await this.get(`/v1/playlists/${ref.id}?fields=snapshot_id`);
    if (before.snapshot_id !== after.snapshot_id) throw new Error('Playlist changed while reading it. Retry to obtain a consistent snapshot.');
    return { name: before.name, revision: before.snapshot_id, tracks };
  }
}

export class Providers {
  constructor(spotify, tools) { this.spotify = spotify; this.tools = tools; }
  async publicSpotify(ref, signal) {
    const response=await fetch(`https://open.spotify.com/playlist/${encodeURIComponent(ref.id)}`,{signal:AbortSignal.any([signal,AbortSignal.timeout(30000)].filter(Boolean))});
    if(!response.ok)throw Error('Spotify public page is unavailable. Connect an eligible account or retry later.');
    let html='',bytes=0;const decoder=new TextDecoder();
    for await(const chunk of response.body){bytes+=chunk.length;if(bytes>4*1024*1024)throw Error('Spotify public page exceeded the metadata limit.');html+=decoder.decode(chunk,{stream:true});}html+=decoder.decode();
    return parsePublicSpotify(html,ref.id);
  }
  async playlist(ref, signal) {
    if (ref.provider === 'spotify') {
      try{return await this.spotify.playlist(ref);}
      catch(error){
        if(signal?.aborted || error.retryAt || !([403,404].includes(error.httpStatus)||/denied playlist access|Connect Spotify|session expired/i.test(error.message)))throw error;
        return this.publicSpotify(ref,signal);
      }
    }
    const raw = await this.tools.metadata(ref.url, { playlist: true, signal });
    if (!Array.isArray(raw.entries) || raw.entries.some(e => !e)) throw new Error('Incomplete SoundCloud playlist; previous snapshot retained.');
    const tracks = raw.entries.map(e => {
      if (!e.title || !e.duration) throw new Error('SoundCloud returned incomplete track metadata; previous snapshot retained.');
      return { key: `soundcloud:${e.id}`, id: String(e.id), provider: 'soundcloud', title: e.track || e.title,
        artist: e.artist || e.uploader || '', duration: e.duration || 0,
        url: mediaUrl(e.webpage_url || e.url), unavailable: e.availability === 'private' || !e.id };
    });
    return { name: raw.title || 'SoundCloud playlist', revision: createHash('sha256').update(JSON.stringify(tracks)).digest('hex'), tracks };
  }
}

/** Use only a provably complete server-rendered public snapshot; never an embed preview. */
export function parsePublicSpotify(html,id) {
  const encoded=/<script\b[^>]*\bid=["']initialState["'][^>]*>([^<]+)<\/script>/.exec(html)?.[1];
  let entity;try{entity=JSON.parse(Buffer.from(encoded||'','base64').toString('utf8')).entities?.items?.[`spotify:playlist:${id}`];}catch{}
  const content=entity?.content;
  if(!entity?.name || !Array.isArray(content?.items) || !Number.isInteger(content.totalCount) || content.items.length!==content.totalCount || !content.pagingInfo || !Object.hasOwn(content.pagingInfo,'nextOffset') || content.pagingInfo.nextOffset!==null)
    throw Error('Spotify only exposed a partial public playlist. Previous snapshot retained. Connect an eligible owner/collaborator account for this playlist.');
  const tracks=content.items.map((entry,index)=>{
    const t=entry.itemV2?.data,trackId=/^spotify:track:([A-Za-z0-9]+)$/.exec(t?.uri||'')?.[1];
    if(!trackId || t.__typename!=='Track')return{key:`unavailable:public:${index}`,title:t?.name||'Unavailable Spotify item',artist:'',duration:0,unavailable:true};
    const artist=t.artists?.items?.map(a=>a.profile?.name).filter(Boolean).join(', '),duration=Number(t.duration?.totalMilliseconds)/1000;
    if(!t.name || !artist || !Number.isFinite(duration)||duration<=0)throw Error('Spotify public track metadata is incomplete; previous snapshot retained.');
    return{key:`spotify:${trackId}`,provider:'spotify',id:trackId,title:t.name,artist,duration,url:`https://open.spotify.com/track/${trackId}`};
  });
  return{name:entity.name,revision:createHash('sha256').update(JSON.stringify(tracks)).digest('hex'),tracks,metadataSource:'public-page'};
}
