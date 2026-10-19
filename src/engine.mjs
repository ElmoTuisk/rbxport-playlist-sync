import { randomUUID, createHash } from 'node:crypto';
import { access, stat } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import { matchTrack, playlistOrder } from './matching.mjs';
import { playlistReference, mediaUrl } from './providers.mjs';

export class Engine {
  constructor(store, providers, downloads, bridge, changed = () => {}) {
    Object.assign(this, { store, providers, downloads, bridge, changed });
    this.active = null; this.controller = null; this.timer = null;
    for (const job of store.all('jobs')) if (['searching', 'downloading', 'validating', 'importing', 'analysing'].includes(job.status)) {
      store.put('jobs', job.id, { ...job, status: 'interrupted', message: 'Interrupted. Retry resumes from the last completed stage.' });
    }
  }
  settings() {
    return { ytdlp: 'yt-dlp', ffmpeg: 'ffmpeg', ffprobe: 'ffprobe', musicFolder: '', cookiesFile: '', autoAnalyse: true,
      quality:'strict-mp3-320', ...(this.store.get('settings', 'main') || {}) };
  }
  saveSettings(value) {
    if (this.active) throw new Error('Wait for the current sync or cancel it before changing settings.');
    const current = this.settings();
    for (const key of ['ytdlp', 'ffmpeg', 'ffprobe', 'musicFolder', 'cookiesFile']) if (typeof value[key] === 'string') current[key] = value[key].trim();
    if (typeof value.autoAnalyse === 'boolean') current.autoAnalyse = value.autoAnalyse;
    if(value.quality!==undefined){if(!['strict-mp3-320','club-aac-256'].includes(value.quality))throw Error('Choose a supported audio standard.');current.quality=value.quality;}
    if (current.musicFolder && !isAbsolute(current.musicFolder)) throw new Error('Music folder must be an absolute path');
    this.store.put('settings', 'main', current); this.changed(); return current;
  }
  async library(playlistId) {
    const view = await this.bridge.call('open', { playlistId });
    if (!view.libraryId || !Number.isInteger(view.len) || view.len > 1000000) throw new Error('Invalid library snapshot');
    const tracks = [];
    for (let offset = 0; offset < view.len; offset += 64) {
      const page = await this.bridge.call('page', { libraryId: view.libraryId, viewId: view.viewId, gen: view.gen, offset, count: Math.min(64, view.len - offset) });
      if (!Array.isArray(page) || page.length !== Math.min(64, view.len - offset)) throw new Error('Library changed during scan; retry');
      tracks.push(...page);
    }
    // Check actual file presence without ever treating a stale metadata row as usable.
    for (let offset = 0; offset < tracks.length; offset += 64) await Promise.all(tracks.slice(offset, offset + 64).map(async track => {
      if (!track.path) { track.missing = true; return; }
      try { await access(track.path); } catch { track.missing = true; }
    }));
    return { ...view, tracks };
  }
  async addLink(value) {
    const ref = playlistReference(value.url);
    const library = await this.bridge.call('info');
    let playlistId = value.playlistId;
    if (!playlistId && value.newName?.trim()) playlistId = await this.bridge.call('create', { libraryId: library.libraryId, name: value.newName.trim() });
    const playlists = await this.bridge.call('info');
    if (!playlists.playlists.some(p => p.id === playlistId)) throw new Error('Choose a regular rbxport playlist');
    if (this.store.all('links').some(l => l.libraryId === library.libraryId && l.playlistId === playlistId)) throw new Error('This target already has a linked source. Choose another playlist.');
    const link = { ...ref, sourceId: ref.id, id: randomUUID(), libraryId: library.libraryId,
      playlistId, name: playlists.playlists.find(p => p.id === playlistId).name, automatic: false, intervalMinutes: 60,
      lastSync: null, lastCheck: null, nextCheck: null, status: 'new', message: 'Preview the first sync', snapshot: null };
    this.store.put('links', link.id, link); this.changed(); return link;
  }
  updateLink(id, value) {
    const link = this.store.get('links', id); if (!link) throw new Error('Playlist link not found');
    if (typeof value.automatic === 'boolean') link.automatic = value.automatic;
    if (value.intervalMinutes !== undefined) link.intervalMinutes = Math.max(15, Math.min(1440, Number(value.intervalMinutes) || 60));
    link.nextCheck = Date.now() + link.intervalMinutes * 60000;
    this.store.put('links', id, link); this.changed(); this.schedule(); return link;
  }
  rowKey(linkId, key) { return `${linkId}|${key}`; }
  bindingKey(libraryId, key) { return `${libraryId}|${key}`; }
  rows(linkId) { return this.store.all('rows').filter(r => r.linkId === linkId && r.present).sort((a, b) => (a.position || 0) - (b.position || 0)); }
  async preview(id, signal, { cached = false } = {}) {
    const link = this.store.get('links', id); if (!link) throw new Error('Playlist link not found');
    const saved = cached ? this.rows(id) : null;
    if (cached && !saved.length) throw new Error('Check the source playlist once before rechecking local files.');
    const source = cached ? { name: link.sourceName, revision: link.snapshot, tracks: saved.map(r => r.track) }
      : await this.providers.playlist({ provider: link.provider, id: link.sourceId, url: link.url }, signal);
    if (!Array.isArray(source.tracks)) throw new Error('Incomplete source snapshot');
    const library = await this.library();
    if (library.libraryId !== link.libraryId) throw new Error('Wrong rbxport library. Open the library used when linking this playlist.');
    if (!library.playlists.some(p => p.id === link.playlistId)) throw new Error('Target playlist was deleted. Link it again.');
    const target = await this.library(link.playlistId);
    if (target.libraryId !== link.libraryId) throw new Error('Library changed during scan');
    const targetIds = new Set(target.tracks.map(t => t.id));
    const rows = []; const seen = new Set();
    for (const track of source.tracks) {
      if (seen.has(track.key)) continue; // One membership per recording in additive mode.
      seen.add(track.key);
      const binding = this.store.get('bindings', this.bindingKey(link.libraryId, track.key));
      let match = track.unavailable ? { status: 'unavailable', reason: 'Source item unavailable', candidates: [] } : matchTrack(track, library.tracks, binding, targetIds);
      const jobId = createHash('sha256').update(this.bindingKey(link.libraryId, track.key)).digest('hex');
      const job = this.store.get('jobs', jobId);
      if (job?.status === 'queued' && (job.overrideUrl || job.sourcePath) && match.status === 'review') match = { status: 'missing', reason: 'Using your selected source; quality checks still apply', candidates: match.candidates };
      const previous = this.store.get('rows', this.rowKey(id, track.key));
      rows.push({ ...previous, localId: undefined, reviewKind: match.status === 'review' ? 'match' : undefined, id: this.rowKey(id, track.key), linkId: id, position: rows.length, track, present: true, ...match });
    }
    this.store.transaction(() => {
      for (const old of this.rows(id)) if (!seen.has(old.track.key)) this.store.put('rows', old.id, { ...old, present: false });
      for (const row of rows) this.store.put('rows', row.id, row);
      const order = playlistOrder(rows.filter(r => r.localId).map(r => r.localId), target.tracks.map(t => t.id));
      this.store.put('links', id, { ...link, sourceName: source.name, snapshot: source.revision, sourceCount: source.tracks.length, extraCount: order.extraCount, lastCheck: Date.now(), status: 'preview', message: 'Preview ready', nextCheck: Date.now() + link.intervalMinutes * 60000 });
    });
    this.changed(); return rows;
  }
  async sync(id, { preview = false, cached = false, soulseek = false, retryMissing = false } = {}) {
    if (this.active) throw new Error('Another sync is running. Wait or cancel it.');
    if (soulseek && !this.downloads.soulseek?.enabled) throw new Error('Connect and enable Soulseek in Settings first.');
    const link = this.store.get('links', id); if (!link) throw new Error('Playlist link not found');
    if (!cached && link.retryAt > Date.now()) throw new Error('Provider is paused by its rate/quota limit. Try after the indicated time.');
    this.active = id; this.controller = new AbortController(); const signal = this.controller.signal;
    const run = { id: randomUUID(), linkId: id, started: Date.now(), preview, status: 'running', added: 0, ready: 0, attention: 0 };
    this.store.put('runs', run.id, run); this.changed();
    try {
      const rows = await this.preview(id, signal, { cached });
      if (!preview) for (const row of rows) {
        signal.throwIfAborted();
        if (row.status === 'matched') {
          const binding = this.store.get('bindings', this.bindingKey(link.libraryId, row.track.key));
          const job = binding?.jobId ? this.store.get('jobs', binding.jobId) : null;
          if (job?.file && job.status !== 'ready') {
            const result = await this.processTrack(link, row, signal); result ? run.ready++ : run.attention++; continue;
          }
          await this.bridge.call('add', { libraryId: link.libraryId, playlistId: link.playlistId, ids: [row.localId] });
          this.store.put('bindings', this.bindingKey(link.libraryId, row.track.key), { ...binding, localId: row.localId });
          this.store.put('rows', row.id, { ...row, status: 'ready', reason: 'Existing track linked' }); run.ready++;
        } else if (row.status === 'missing' || (retryMissing && row.status==='missing_file') || (row.status === 'review' && (this.downloads.soulseek?.enabled || retryMissing) && !row.candidates?.some(c => c.certain))) {
          const result = await this.processTrack(link, row, signal, { preferSoulseek: soulseek, retrySoulseek: soulseek, retryAll:retryMissing }); result ? run.ready++ : run.attention++;
        } else if (row.status !== 'ignored') run.attention++;
        this.changed();
      }
      if (!preview) {
        signal.throwIfAborted();
        const target = await this.library(link.playlistId);
        const order = playlistOrder(this.rows(id).filter(r => ['ready','matched'].includes(r.status)).map(r => r.localId), target.tracks.map(t => t.id));
        if (order.changed) {
          if (new Set(order.ids).size !== order.ids.length) throw new Error('Songs synced, but order needs review: the target contains repeated entries. rbxport cannot safely reorder those automatically.');
          this.store.put('orders', run.id, { libraryId: link.libraryId, playlistId: link.playlistId, before: target.tracks.map(t => t.id), after: order.ids, created: Date.now() });
          await this.bridge.call('reorder', { libraryId: link.libraryId, playlistId: link.playlistId, ids: order.ids, expectedIds: target.tracks.map(t => t.id) });
        }
        run.extraCount = order.extraCount;
      }
      run.status = 'complete';
      const current = this.store.get('links', id);
      const found = rows.filter(r => ['ready','matched'].includes(r.status)).length;
      const attention = rows.filter(r => !['ready','matched','ignored'].includes(r.status)).length;
      this.store.put('links', id, { ...current, extraCount: run.extraCount ?? current.extraCount, lastSync: preview ? current.lastSync : Date.now(), status: preview ? 'preview' : run.attention ? 'attention' : 'synced', message: preview ? `${found} in collection · ${attention} need attention` : `${run.ready} ready · ${run.attention} need attention`, retryAt: null });
    } catch (error) {
      run.status = signal.aborted ? 'cancelled' : 'failed'; run.message = error.message;
      const current = this.store.get('links', id);
      this.store.put('links', id, { ...current, status: run.status, message: error.message, retryAt: error.retryAt || null,
        nextCheck: Math.max(error.retryAt || 0, Date.now() + link.intervalMinutes * 60000) });
    } finally {
      run.finished = Date.now(); this.store.put('runs', run.id, run); this.active = null; this.controller = null; this.changed(); this.schedule();
    }
    return run;
  }
  async processTrack(link, row, signal, { preferSoulseek = false, retrySoulseek = false, retryAll = false } = {}) {
    const id = createHash('sha256').update(this.bindingKey(link.libraryId, row.track.key)).digest('hex');
    let job = this.store.get('jobs', id) || { id, key: row.track.key, title: row.track.title, artist: row.track.artist, libraryId: link.libraryId, created: Date.now(), status: 'queued' };
    job = { ...job, linkId: link.id, rowId: row.id };
    const fallback = this.downloads.soulseek?.enabled;
    const explicitSource = Boolean(job.overrideUrl || job.acquisition==='manual' || (job.sourcePath && !job.acquisition));
    if(retryAll && !job.file && job.status!=='cancelled') {
      job={...job,status:'queued',acquisition:explicitSource?'manual':null,attempts:[]};
      preferSoulseek=false;
    }
    if (fallback && job.acquisition === 'soulseek' && !explicitSource) preferSoulseek = true;
    if (job.status === 'review' || job.status === 'cancelled') {
      if (fallback && !explicitSource && (job.status !== 'cancelled' || retrySoulseek) && (retrySoulseek || job.acquisition !== 'soulseek')) preferSoulseek = true;
      else { this.store.put('rows', row.id, { ...row, status: 'review', reviewKind:'source', reason: job.message }); return false; }
      if (retrySoulseek && job.acquisition === 'soulseek' && !job.file) job = {...job,sourcePath:null,sourceReport:null};
    }
    const update = fields => { job = { ...job, ...fields, updated: Date.now() }; this.store.put('jobs', id, job); this.changed(); };
    try {
      if (!this.settings().musicFolder) throw new Error('Choose a music download folder in Settings.');
      if(job.file)try{await access(job.file);}catch(error){if(error.code!=='ENOENT')throw error;update({file:null,localId:null,analysed:false});}
      if(job.sourcePath && !explicitSource)try{await access(job.sourcePath);}catch(error){if(error.code!=='ENOENT')throw error;update({sourcePath:null,sourceReport:null});}
      const acquireFallback = async () => {
        const webAttempts=job.attempts || []; let peerAttempts=[];
        update({acquisition:'soulseek',status:'searching',progress:'',message:'Trying Soulseek fallback'});
        const peerUpdate=fields=>{if(fields.attempts)peerAttempts=fields.attempts;update({...fields,attempts:[...webAttempts,...peerAttempts].slice(-30)});};
        try {
          if (!job.sourcePath) peerUpdate(await this.downloads.soulseek.acquire(row.track,job,peerUpdate,signal));
          const result=await this.downloads.acquire(row.track,job,fields=>{const {attempts,...rest}=fields;update(rest);},signal);
          return {...result,attempts:[...webAttempts,...peerAttempts].slice(-30)};
        } catch(error) {
          if(error.code==='QUALITY_REVIEW' && webAttempts.some(a=>a.status==='quality'))error.message='Recordings were found on the web but did not meet your audio standard; Soulseek also found no verified alternative. See source attempts.';
          throw error;
        }
      };
      if (!job.file) {
        if (preferSoulseek && fallback && !explicitSource) update(await acquireFallback());
        else {
          try { if(!explicitSource)update({acquisition:'web'});update(await this.downloads.acquire(row.track,job,update,signal)); }
          catch (error) {
            if (!fallback || explicitSource || signal.aborted) throw error;
            // Do not reuse a rejected web source as if it came from Soulseek.
            update({sourcePath:null,sourceReport:null});
            update(await acquireFallback());
          }
        }
      }
      else await this.downloads.verify(job.file, row.track, signal, true);
      signal.throwIfAborted();
      update({ status: 'importing', message: 'Importing verified file into rbxport' });
      const imported = await this.bridge.call('import', { libraryId: link.libraryId, paths: [job.file] });
      const local = [...imported.tracks, ...imported.existing][0];
      if (!local) throw new Error(`Import did not succeed: ${imported.skipped.join('; ')}`);
      update({ localId: local.id, needsAnalysis: job.needsAnalysis || imported.tracks.length > 0 });
      // Save binding before membership/analysis so a restart cannot acquire this track twice.
      this.store.put('bindings', this.bindingKey(link.libraryId, row.track.key), { localId: local.id, jobId: id });
      await this.bridge.call('add', { libraryId: link.libraryId, playlistId: link.playlistId, ids: [local.id] });
      if (this.settings().autoAnalyse && !job.analysed && job.needsAnalysis) {
        update({ status: 'analysing', message: 'Analyzing new track' });
        await this.bridge.call('analyse', { libraryId: link.libraryId, id: local.id }); update({ analysed: true });
      }
      update({ status: 'ready', message: 'Ready in rbxport', progress: '' });
      this.store.put('rows', row.id, { ...row, localId: local.id, status: 'ready', reason: 'Downloaded, validated and imported' }); return true;
    } catch (error) {
      const status = signal.aborted ? 'cancelled' : error.code === 'QUALITY_REVIEW' || /Quality check/.test(error.message) ? 'review' : 'failed';
      update({ status, message: error.message });
      this.store.put('rows', row.id, { ...row, status, reviewKind:'source', reason: error.message });
      if (['SOULSEEK_AUTH','SOULSEEK_CONNECTION','SOULSEEK_SETUP'].includes(error.code)) throw error;
      return false;
    }
  }
  async resolveRow(id, value) {
    if (this.active) throw new Error('Wait for the current sync or cancel it before changing a match.');
    const row = this.store.get('rows', id); if (!row) throw new Error('Track not found');
    const link = this.store.get('links', row.linkId);
    if (value.action === 'ignore') this.store.put('bindings', this.bindingKey(link.libraryId, row.track.key), { ignored: true });
    else if (value.action === 'match') {
      const result = await this.bridge.call('track', { libraryId: link.libraryId, id: String(value.localId) });
      await access(result.path);
      this.store.put('bindings', this.bindingKey(link.libraryId, row.track.key), { localId: result.id });
    } else if (['retry', 'source', 'file'].includes(value.action)) {
      const jobId = createHash('sha256').update(this.bindingKey(link.libraryId, row.track.key)).digest('hex');
      const job = this.store.get('jobs', jobId) || { id: jobId, key: row.track.key, title: row.track.title, artist: row.track.artist, libraryId: link.libraryId, linkId: link.id, rowId: id, created: Date.now() };
      if (value.action === 'source') { job.overrideUrl = mediaUrl(value.url); job.sourcePath = null; job.file = null; job.acquisition='manual'; }
      if (value.action === 'file') {
        if (!isAbsolute(value.path || '')) throw new Error('Supply an absolute audio-file path.');
        if (!(await stat(value.path)).isFile()) throw new Error('Not an audio file');
        job.sourcePath = value.path; job.file = null; job.overrideUrl=null; job.acquisition='manual';
      }
      this.store.put('jobs', jobId, { ...job, status: 'queued', message: 'Ready to retry on next sync' });
      // Explicit source/file selection resolves identity uncertainty; quality gates still apply.
      this.store.delete('bindings', this.bindingKey(link.libraryId, row.track.key));
      this.store.put('rows', id, { ...row, status: 'missing', reason: 'Ready to retry' });
    } else throw new Error('Unknown review action');
    if (['ignore', 'match'].includes(value.action)) this.store.put('rows', id, { ...row, status: value.action === 'ignore' ? 'ignored' : 'matched', localId: value.localId, reason: 'Saved your decision' });
    this.changed();
  }
  cancel() { this.controller?.abort(); }
  schedule() {
    clearTimeout(this.timer); if (this.active || this.closed) return;
    const links = this.store.all('links').filter(l => l.automatic);
    if (!links.length) return;
    const link = links.sort((a, b) => Math.max(a.nextCheck || 0, a.retryAt || 0) - Math.max(b.nextCheck || 0, b.retryAt || 0))[0];
    const delay = Math.max(10000, Math.max(link.nextCheck || 0, link.retryAt || 0) - Date.now());
    this.timer = setTimeout(() => {
      if (!this.bridge.connected) { link.nextCheck = Date.now() + 60000; this.store.put('links', link.id, link); this.schedule(); return; }
      void this.sync(link.id).catch(() => this.schedule());
    }, delay); this.timer.unref?.();
  }
  close() { this.closed = true; clearTimeout(this.timer); this.cancel(); }
}
