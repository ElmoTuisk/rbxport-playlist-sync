/** Shared by the standalone fallback and the in-rbxport popover. No network or host globals. */
export function mountPanel(root, initial, send) {
  if (root.playlistSyncPanel) { root.playlistSyncPanel.update(initial); return root.playlistSyncPanel; }
  let model = initial, expanded = null, mode = '', reviewing = null, error = '', busy = false;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const button = (action, text, id = '', extra = '') => `<button type="button" data-action="${action}" data-id="${esc(id)}" ${extra}>${text}</button>`;
  const rows = () => model.rows?.[expanded] || [];
  const needsHelp = row => !['ready', 'matched', 'ignored'].includes(row.status);
  const labels = { missing: 'Missing', review: 'Check source', missing_file: 'File unavailable', unavailable: 'Unavailable', failed: 'Failed', cancelled: 'Cancelled', interrupted: 'Interrupted' };
  function render(force = false) {
    if (!force && root.contains(document.activeElement) && /INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) return;
    root.innerHTML = `<div class="ps-head"><strong>Playlist sync</strong><div>${button('settings', '⚙', '', 'aria-label="Sync settings" title="Settings"')}${button('close', '×', '', 'aria-label="Close playlist sync"')}</div></div>
      ${error ? `<p class="ps-error" role="alert">${esc(error)}</p>` : ''}
      ${model.demo ? '<p class="ps-muted">Example data</p>' : ''}
      ${model.connected || model.demo ? '' : `<p class="ps-muted">rbxport is disconnected. ${button('connect', 'Reconnect')}</p>`}
      <div class="ps-list">${(model.links || []).map(link => {
        const progress = (model.jobs || []).find(j => j.linkId === link.id && ['searching','downloading','validating','importing','analysing'].includes(j.status));
        const status = model.active === link.id ? progress ? `${progress.title} · ${progress.status}${progress.progress ? ` ${progress.progress}` : ''}` : 'Checking playlist…' : link.message || 'Ready to check';
        return `<section class="ps-playlist"><div class="ps-line"><button class="ps-name" type="button" data-action="details" data-id="${esc(link.id)}" aria-expanded="${expanded === link.id}"><span class="ps-symbol ${link.status === 'synced' ? 'ps-good' : link.status === 'attention' || link.status === 'failed' ? 'ps-warn' : ''}" title="${esc(link.status === 'synced' ? 'Synced' : 'Linked playlist')}">⇄</span>${esc(link.name)}</button>${button('sync', 'Sync', link.id, model.active || busy ? 'disabled' : '')}</div><p class="ps-status">${esc(status)}</p>
          ${expanded === link.id ? `<div class="ps-details"><label class="ps-check"><input type="checkbox" data-automatic="${esc(link.id)}" ${link.automatic ? 'checked' : ''}> Auto-sync</label>${link.extraCount ? `<p class="ps-muted">${link.extraCount} extra local songs kept at the bottom.</p>` : ''}
          ${rows().filter(needsHelp).map(row => `<div class="ps-track"><div><strong>${esc(row.track.title)}</strong><small>${esc(labels[row.status] || row.status)}</small></div>${button('review', reviewing === row.id ? 'Close' : 'Resolve', row.id, `aria-expanded="${reviewing === row.id}"`)}</div>${reviewing === row.id ? reviewForm(row) : ''}`).join('') || `<p class="ps-muted">${link.lastCheck ? 'No tracks need attention.' : 'Sync to check this playlist.'}</p>`}
          <details class="ps-more"><summary>All tracks · ${rows().length}</summary>${rows().map(r => `<div class="ps-track"><div><strong>${esc(r.track.title)}</strong><small>${esc(r.track.artist)} · ${esc(labels[r.status] || r.status)}</small></div></div>`).join('')}</details></div>` : ''}</section>`;
      }).join('') || '<p class="ps-empty">Link a Spotify or SoundCloud playlist.</p>'}</div>
      ${mode === 'link' ? linkForm() : mode === 'settings' ? settingsForm() : ''}
      <div class="ps-foot">${button('link', '+ Link playlist', '', 'class="ps-text"')}<span>320 kbps MP3</span>${model.active ? button('cancel', 'Cancel') : ''}</div>`;
  }
  function linkForm() {
    return `<form data-form="link" class="ps-form"><label>Playlist URL<input name="url" type="url" placeholder="Spotify or SoundCloud link" required></label><label>rbxport playlist<select name="playlistId"><option value="">Create new…</option>${(model.playlists || []).map(p => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('')}</select></label><label>New name <span class="ps-muted">(if creating)</span><input name="newName"></label><div class="ps-form-actions">${button('dismiss', 'Cancel')}<button ${busy ? 'disabled' : ''}>Link</button></div></form>`;
  }
  function reviewForm(row) {
    if (!row) return '';
    return `<form data-form="resolve" data-id="${esc(row.id)}" class="ps-form"><strong>${esc(row.track.title)}</strong><p class="ps-muted">${esc(row.reason)}</p><label>Resolve<select name="action" id="ps-resolution"><option value="file">Use an audio file</option><option value="match">Match existing track</option><option value="source">Use a source URL</option><option value="retry">Retry</option><option value="ignore">Ignore</option></select></label><div id="ps-resolution-fields"><label>Audio file path<input name="path" placeholder="C:\\Music\\original.flac" required></label></div><div class="ps-form-actions">${button('dismiss-review', 'Cancel')}<button>Save</button></div></form>`;
  }
  function settingsForm() {
    const s = model.settings || {};
    const spotify = model.spotify || {};
    return `<div class="ps-form"><form data-form="settings"><label>Download folder<input name="musicFolder" value="${esc(s.musicFolder)}" required></label><details class="ps-more"><summary>Advanced</summary>${[['ytdlp','yt-dlp'],['ffmpeg','FFmpeg'],['ffprobe','FFprobe'],['cookiesFile','SoundCloud cookies file']].map(([key,label]) => `<label>${label}<input name="${key}" value="${esc(s[key])}"></label>`).join('')}<label class="ps-check"><input type="checkbox" name="autoAnalyse" ${s.autoAnalyse ? 'checked' : ''}> Analyze new tracks</label><p class="ps-muted">New audio requires a 320 kbps MP3 or lossless source. Duration and full decoding are checked.</p></details><div class="ps-form-actions">${button('dismiss','Done')}<button>Save</button></div></form><details class="ps-more"><summary>${spotify.connected ? 'Spotify connected' : spotify.status === 'waiting' ? 'Spotify · finish sign-in' : 'Connect Spotify'}</summary><form data-form="spotify">${spotify.message ? `<p class="ps-muted" role="status">${esc(spotify.message)}</p>` : ''}<p class="ps-muted">In the Spotify developer dashboard, register this exact redirect URI. Then use Connect below; the address itself is not a sign-in link.</p><code>http://127.0.0.1:43821/oauth/spotify</code><label>Client ID<input name="clientId" value="${esc(spotify.clientId || '')}" required autocomplete="off"></label><button ${busy ? 'disabled' : ''}>${spotify.connected ? 'Reconnect' : 'Connect'}</button></form></details></div>`;
  }
  async function act(action, value = {}) {
    error = ''; busy = true;
    try { await send(action, value); } catch (e) { error = e.message; }
    finally { busy = false; render(true); }
  }
  root.addEventListener('click', async event => {
    const target = event.target.closest('[data-action]'); if (!target) return;
    const { action, id } = target.dataset;
    if (action === 'details') { expanded = expanded === id ? null : id; reviewing = null; render(true); if (expanded) await act('select', { id }); }
    else if (action === 'link') { mode = mode === 'link' ? '' : 'link'; expanded = null; render(true); if (mode) await act('options'); }
    else if (action === 'settings') { mode = mode === 'settings' ? '' : 'settings'; expanded = null; render(true); }
    else if (action === 'dismiss') { mode = ''; render(true); }
    else if (action === 'review') {
      reviewing = reviewing === id ? null : id; render(true);
      if (reviewing) requestAnimationFrame(() => {
        const form = root.querySelector('[data-form="resolve"]');
        if (form?.dataset.id !== reviewing) return;
        form.scrollIntoView({ block: 'nearest' });
        form.querySelector('select')?.focus({ preventScroll: true });
      });
    }
    else if (action === 'dismiss-review') { reviewing = null; render(true); }
    else await act(action, { id });
  });
  root.addEventListener('change', async event => {
    if (event.target.dataset.automatic) await act('automatic', { id: event.target.dataset.automatic, automatic: event.target.checked });
    if (event.target.id === 'ps-resolution') {
      const action = event.target.value;
      root.querySelector('#ps-resolution-fields').innerHTML = action === 'file' ? '<label>Audio file path<input name="path" required></label>' : action === 'source' ? '<label>Source URL<input name="url" type="url" required></label>' : action === 'match' ? '<label>rbxport track ID<input name="localId" required></label>' : '';
    }
  });
  root.addEventListener('submit', async event => {
    event.preventDefault(); const form = event.target; const value = Object.fromEntries(new FormData(form));
    if (form.dataset.form === 'settings') value.autoAnalyse = form.elements.autoAnalyse.checked;
    if (form.dataset.form === 'resolve') value.id = form.dataset.id;
    await act(form.dataset.form, value);
    if (!error) { mode = form.dataset.form === 'spotify' ? 'settings' : ''; reviewing = null; render(true); }
  });
  const controller = { update(value) {
    const selectionChanged = value.selectionRevision !== model.selectionRevision && value.selected;
    if (selectionChanged) { expanded = value.selected; reviewing = null; mode = ''; }
    model = value; render(Boolean(selectionChanged));
  }, showError(message) { error = message; busy = false; render(true); }, collapse() { expanded = null; mode = ''; reviewing = null; error = ''; render(true); } };
  root.playlistSyncPanel = controller; render(); return controller;
}
