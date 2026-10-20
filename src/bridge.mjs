// Windows rbxport 1.9.0 explicitly exposes RBXPORT_DEVTOOLS_PORT for automation.
// Use only its existing guarded commands; never open or write master.db ourselves.
import { mountPanel } from '../public/panel.mjs';
import { installHostUi, fitPopover, HOST_UI_VERSION } from './host-ui.mjs';
export class Bridge {
  constructor(changed = () => {}) { this.socket = null; this.pending = new Map(); this.sequence = 0; this.changed = changed; this.contexts = new Map(); }
  get connected() { return this.socket?.readyState === WebSocket.OPEN; }
  async connect({ verifyLibrary = true } = {}) {
    if (this.connected) return verifyLibrary ? this.call('info') : { attached: true };
    const response = await fetch('http://127.0.0.1:43822/json/list', { signal: AbortSignal.timeout(5000) });
    if (!response.ok) throw new Error('Launch rbxport using Start-Playlist-Sync.ps1 first.');
    const pages = await response.json();
    const page = pages.find(p => p.type === 'page' && /^https?:\/\/tauri\.localhost\/?(?:#.*)?$/.test(p.url));
    if (!page) throw new Error('No rbxport main window found on its automation port.');
    const target = new URL(page.webSocketDebuggerUrl);
    if (!['127.0.0.1', 'localhost'].includes(target.hostname) || target.port !== '43822') throw new Error('Non-local automation target refused');
    target.hostname = '127.0.0.1';
    const socket = new WebSocket(target); this.socket = socket;
    socket.addEventListener('message', event => {
      let message; try { message = JSON.parse(event.data); } catch { return; }
      if (message.method === 'Runtime.executionContextCreated') this.contexts.set(message.params.context.id, message.params.context);
      if (message.method === 'Runtime.executionContextsCleared') { this.contexts.clear(); this.boundContext = null; this.hostInstalled=false; }
      if (message.method === 'Runtime.bindingCalled' && message.params.name === '__playlistSyncAction') {
        if (this.acceptsHostContext(message.params.executionContextId)) {
          try { void this.onAction?.(JSON.parse(message.params.payload)); } catch { /* Malformed actions are ignored. */ }
        }
      }
      const pending = this.pending.get(message.id); if (!pending) return;
      clearTimeout(pending.timer); this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(message.error.message));
      else if (message.result?.exceptionDetails) pending.reject(new Error(message.result.exceptionDetails.exception?.description || 'rbxport operation failed'));
      else pending.resolve(pending.raw ? message.result : message.result?.result?.value);
    });
    socket.addEventListener('close', () => { this.close(); this.changed(); });
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => { socket.close(); reject(new Error('rbxport connection timed out')); }, 10000);
      socket.addEventListener('open', () => { clearTimeout(timer); resolve(); }, { once: true });
      socket.addEventListener('error', () => { clearTimeout(timer); reject(new Error('Could not connect to rbxport')); }, { once: true });
    });
    const tree = await this.request('Page.getFrameTree', {}, true);
    this.mainFrameId = tree.frameTree.frame.id;
    await this.request('Runtime.enable', {}, true);
    this.changed();
    return verifyLibrary ? this.call('info') : { attached: true };
  }
  request(method, params, raw = false, timeout = 120000) {
    if (!this.connected) return Promise.reject(new Error('rbxport disconnected'));
    const id = ++this.sequence;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`rbxport ${method} timed out`)); }, timeout);
      this.pending.set(id, { resolve, reject, timer, raw });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }
  acceptsHostContext(id) {
    const context = this.contexts.get(id);
    return Boolean(context?.auxData?.frameId === this.mainFrameId && context.auxData.isDefault && /^https?:\/\/tauri\.localhost$/.test(context.origin));
  }
  evaluate(expression) { return this.request('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); }
  async updateHost(model, css) {
    const context = [...this.contexts.values()].find(c => c.auxData?.frameId === this.mainFrameId && c.auxData.isDefault && /^https?:\/\/tauri\.localhost$/.test(c.origin));
    if (!context) throw new Error('Main rbxport window is unavailable');
    if (this.boundContext !== context.id) {
      await this.request('Runtime.addBinding', { name: '__playlistSyncAction', executionContextId: context.id }, true);
      this.boundContext = context.id;
    }
    if(this.hostInstalled){const result=await this.evaluate(`(()=>{const host=window.__rbxportPlaylistSync;if(!host || host.version!==${HOST_UI_VERSION})return {needsInstall:true};host.update(${JSON.stringify(model)});const button=document.querySelector('#playlist-sync-button');return {installed:true,ready:!!button?.isConnected&&button.getClientRects().length>0};})()`);if(!result?.needsInstall)return result;}
    const result=await this.evaluate(`(${installHostUi.toString()})(${JSON.stringify(model)},${mountPanel.toString()},${JSON.stringify(css)},${fitPopover.toString()},${HOST_UI_VERSION})`);this.hostInstalled=true;return result;
  }
  replyHost(id, result, error) { return this.evaluate(`window.__rbxportPlaylistSync?.reply(${JSON.stringify(id)},${JSON.stringify(result ?? null)},${JSON.stringify(error || null)})`); }
  openPanel() { return this.evaluate('window.__rbxportPlaylistSync?.open()'); }
  removeHost() { return this.evaluate('window.__rbxportPlaylistSync?.dispose()'); }
  async call(method, args = {}) {
    if (!this.connected) throw new Error('Connect rbxport first. Use the add-on launcher if its automation port is closed.');
    const methods = {
      info: `return {libraryId,playlists:(await invoke('playlist_tree')).filter(p=>p.kind==='playlist'),summary:await invoke('library_summary')};`,
      open: `const view=await invoke('open_view',{spec:{source:a.playlistId?{kind:'playlist',id:a.playlistId}:{kind:'collection'},sort:'trackNo',descending:false,query:''}});return {...view,libraryId,playlists:(await invoke('playlist_tree')).filter(p=>p.kind==='playlist')};`,
      page: `const rows=await invoke('fetch_rows',{viewId:a.viewId,offset:a.offset,len:a.count,extraColumns:['location','bitrate','sampleRate','mixName']});return rows.map(r=>({id:r.id,title:r.title,artist:r.artist,album:r.album,duration:r.durationSec,path:String(r.extra?.location||''),bitrate:Number(r.extra?.bitrate||0),sampleRate:Number(r.extra?.sampleRate||0),mixName:String(r.extra?.mixName||''),missing:Boolean(r.missing)}));`,
      track: `return invoke('track_details',{track:a.id});`,
      create: `const before=await invoke('playlist_tree');await invoke('create_playlist',{name:a.name,parent:'root'});const after=await invoke('playlist_tree');const fresh=after.filter(p=>p.kind==='playlist'&&!before.some(b=>b.id===p.id));if(fresh.length!==1)throw Error('Cannot identify newly created playlist');return fresh[0].id;`,
      import: `return invoke('import_files',{paths:a.paths});`,
      add: `const present=await invoke('playlist_duplicates',{playlist:a.playlistId,tracks:a.ids});const missing=a.ids.filter(id=>!present.includes(id));if(!missing.length)return 0;return invoke('add_tracks_to_playlist',{playlist:a.playlistId,tracks:missing,allowDuplicates:false});`,
      analyse: `return invoke('analyse_track',{trackId:a.id,mode:'rbxport',settings:null,keyTag:null,drawing:false});`,
      reorder: `const view=await invoke('open_view',{spec:{source:{kind:'playlist',id:a.playlistId},sort:'trackNo',descending:false,query:''}});const current=view.len?await invoke('view_ids_in_range',{viewId:view.viewId,from:0,to:view.len-1}):[];if(JSON.stringify(current)!==JSON.stringify(a.expectedIds))throw Error('Playlist changed while syncing; order left unchanged. Retry.');return invoke('reorder_playlist',{playlist:a.playlistId,tracks:a.ids});`,
    };
    if (!methods[method]) throw new Error('Unsupported add-on capability');
    // All variable data is serialized, never interpolated as executable source.
    const expression = `(async()=>{try{const a=${JSON.stringify(args)};const invoke=window.__TAURI_INTERNALS__.invoke;let drives;try{drives=await invoke('database_drives');}catch(e){if(/(?:command.*database_drives.*not found|unknown command.*database_drives)/i.test(e?.message||String(e)))throw Error('This rbxport build lacks the library API required by Playlist Sync. Close it and open the Playlist Sync shortcut with a compatible installation (tested with rbxport 1.9.0).');throw e;}const activeDrive=drives.find(d=>d.current);if(!activeDrive)throw Error('Cannot establish current library identity');const libraryId=activeDrive.masterDb.replaceAll('\\\\','/').toLowerCase();if(a.libraryId&&a.libraryId!==libraryId)throw Error('Wrong library; operation refused');${methods[method]}}catch(e){throw Error(e?.message||String(e))}})()`;
    return this.request('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, false, method === 'analyse' ? 900000 : 120000);
  }
  close() {
    this.libraryReady = false;
    const socket = this.socket; this.socket = null; socket?.close();
    for (const p of this.pending.values()) { clearTimeout(p.timer); p.reject(new Error('rbxport disconnected')); }
    this.pending.clear();
    this.contexts.clear(); this.boundContext = null;
    this.hostInstalled=false;
  }
}
