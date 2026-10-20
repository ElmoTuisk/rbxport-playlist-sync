// Public page hints supplement extractor metadata; never request protected audio.
export function soundcloudPageHints(html) {
  const raw = /window\.__sc_hydration\s*=\s*(\[.*?\]);/s.exec(html)?.[1];
  if (!raw) return [];
  const items = JSON.parse(raw), hints = [];
  for (const item of items) {
    const tracks = item.hydratable === 'sound' ? [item.data] : item.hydratable === 'playlist' ? item.data?.tracks || [] : [];
    for (const track of tracks) {
      if (!track?.id) continue;
      hints.push({ id: String(track.id), complete: typeof track.downloadable === 'boolean',
        duration: Number(track.full_duration || track.duration || 0) / 1000,
        preview: track.policy === 'SNIP', downloadable: Boolean(track.downloadable),
        external: Boolean(track.purchase_url), downloadTitle: track.purchase_title || 'Artist download' });
    }
  }
  return hints;
}

export class SoundCloudPages {
  constructor(fetcher = fetch, { clock = Date.now, limit = 256, ttl = 600000 } = {}) {
    Object.assign(this, { fetcher, clock, limit, ttl }); this.pages = new Map(); this.tracks = new Map();
  }
  async read(url, signal) {
    if(!url)return [];
    const address = new URL(url);
    if (address.protocol !== 'https:' || !['soundcloud.com','www.soundcloud.com'].includes(address.hostname)) return [];
    address.hostname = 'soundcloud.com'; address.search = ''; address.hash = '';
    const key = address.href, saved = this.pages.get(key);
    if (saved && saved.expires > this.clock()) return saved.value;
    signal?.throwIfAborted();
    try {
      const response = await this.fetcher(key, { redirect: 'error', signal: AbortSignal.any([signal, AbortSignal.timeout(15000)].filter(Boolean)) });
      if (!response.ok) return [];
      let html = '', bytes = 0; const decoder = new TextDecoder();
      for await (const chunk of response.body) { bytes += chunk.length; if (bytes > 4*1024*1024) throw Error('SoundCloud page too large'); html += decoder.decode(chunk,{stream:true}); }
      html += decoder.decode(); const value = soundcloudPageHints(html), expires = this.clock()+this.ttl;
      for (const hint of value) if (hint.complete) { this.tracks.delete(hint.id); this.tracks.set(hint.id,{...hint,expires}); }
      this.pages.delete(key); this.pages.set(key,{value:value.slice(0,this.limit),expires});
      while(this.pages.size>this.limit)this.pages.delete(this.pages.keys().next().value);
      while(this.tracks.size>this.limit)this.tracks.delete(this.tracks.keys().next().value);
      return value;
    } catch (error) { if(signal?.aborted)throw error; return []; }
  }
  async track(info, signal, { fetchMissing = true } = {}) {
    let hint = this.tracks.get(String(info.id));
    if (hint?.expires > this.clock()) return hint;
    if (!fetchMissing) return null;
    await this.read(info.webpage_url || info.original_url, signal);
    hint = this.tracks.get(String(info.id)); return hint?.expires > this.clock() ? hint : null;
  }
}
