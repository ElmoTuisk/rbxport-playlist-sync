/** Injected through the existing local automation connection; no database edits or CSP changes. */
export function fitPopover(viewport, anchor, panel, margin = 12) {
  const maxWidth = Math.max(0, viewport.width - margin * 2);
  const maxHeight = Math.max(0, viewport.height - margin * 2);
  const width = Math.min(panel.width, maxWidth), height = Math.min(panel.height, maxHeight);
  const left = viewport.left || 0, top = viewport.top || 0;
  return { maxWidth, maxHeight,
    left: Math.max(left + margin, Math.min(anchor.right + 8, left + viewport.width - margin - width)),
    top: Math.max(top + margin, Math.min(anchor.top, top + viewport.height - margin - height)) };
}

export function installHostUi(model, mountPanel, css, fitPopover) {
  const key = '__rbxportPlaylistSync';
  if (window[key] && window[key].version !== 8) window[key].dispose();
  if (window[key]) { window[key].update(model); return { installed: true }; }
  const sheet = new CSSStyleSheet(); sheet.replaceSync(css); document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
  let current = model, timer = null, layoutFrame = null, stopped = false;
  const popover = document.createElement('div'); popover.id = 'playlist-sync-popover'; popover.hidden = true;
  const root = document.createElement('div'); root.id = 'playlist-sync-root'; popover.append(root); document.body.append(popover);
  const pending = new Map(); let sequence = 0;
  const send = (action, args = {}) => {
    if (action === 'close') { popover.hidden = true; return; }
    if (typeof window.__playlistSyncAction !== 'function') throw Error('Playlist Sync is disconnected. Open the Playlist Sync shortcut again.');
    const id = ++sequence;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => { pending.delete(id); reject(Error('Playlist Sync did not respond. Open its shortcut to reconnect.')); }, 15000);
      pending.set(id, { resolve, reject, timeout });
      window.__playlistSyncAction(JSON.stringify({ id, action, args }));
    }).then(async result => {
      if (result?.url && new URL(result.url).origin === 'https://accounts.spotify.com') await window.__TAURI_INTERNALS__.invoke('open_url', { url: result.url });
      return result;
    });
  };
  const panel = mountPanel(root, model, send);
  const position = () => {
    if (popover.hidden || stopped) return;
    const rect = toolbar.getBoundingClientRect();
    const visual = window.visualViewport;
    const layout = fitPopover({ left: visual?.offsetLeft || 0, top: visual?.offsetTop || 0,
      width: visual?.width || window.innerWidth, height: visual?.height || window.innerHeight }, rect,
      { width: 390, height: root.scrollHeight + 2 });
    popover.style.maxWidth = `${layout.maxWidth}px`;
    popover.style.maxHeight = `${layout.maxHeight}px`;
    popover.style.left = `${layout.left}px`;
    popover.style.top = `${layout.top}px`;
    popover.style.right = 'auto';
  };
  const schedulePosition = () => {
    if (layoutFrame === null && !stopped) layoutFrame = requestAnimationFrame(() => { layoutFrame = null; position(); });
  };
  const sizeObserver = new ResizeObserver(schedulePosition);
  sizeObserver.observe(root);
  const open = id => { if (!id) panel.collapse(); popover.hidden = false; position(); if (id) void send('select', { id }).catch(e => panel.showError(e.message)); };
  const toolbar = document.createElement('button'); toolbar.id = 'playlist-sync-button'; toolbar.type = 'button';
  const icon = document.createElement('span'); icon.textContent = '⇄'; icon.setAttribute('aria-hidden', 'true');
  const label = document.createElement('span'); label.textContent = 'Playlist sync'; toolbar.append(icon, label);
  toolbar.title = 'Playlist sync'; toolbar.setAttribute('aria-label', 'Playlist sync');
  toolbar.addEventListener('click', event => { event.stopPropagation(); popover.hidden ? open() : popover.hidden = true; });
  toolbar.addEventListener('mousedown', e => e.stopPropagation());
  popover.addEventListener('mousedown', e => e.stopPropagation());
  const outside = event => { if (!popover.contains(event.target) && !toolbar.contains(event.target) && !event.target.closest('[data-playlist-sync-badge]')) popover.hidden = true; };
  const escape = event => { if (event.key === 'Escape' && !popover.hidden) { popover.hidden = true; event.stopPropagation(); toolbar.focus(); } };
  document.addEventListener('pointerdown', outside); document.addEventListener('keydown', escape, true);
  window.addEventListener('resize', position);
  window.visualViewport?.addEventListener('resize', schedulePosition);
  window.visualViewport?.addEventListener('scroll', schedulePosition);
  function decorate() {
    timer = null; if (stopped) return;
    const tagList = document.querySelector('button[aria-label="Tag List"]');
    if (tagList && tagList.parentElement.nextElementSibling !== toolbar) {
      toolbar.className = tagList.className;
      label.className = tagList.querySelector('span')?.className || '';
      tagList.parentElement.after(toolbar);
    }
    for (const row of document.querySelectorAll('[role="treeitem"][data-kind="playlist"]')) {
      const label = [...row.children].find(e => e.tagName === 'SPAN' && !e.hasAttribute('aria-label'));
      let id = row.getAttribute('data-file-drop-playlist');
      // Read-only host rows omit their drop ID. Exact unique names are the safe fallback.
      if (!id && label) {
        const matches = current.playlists.filter(p => p.name === label.textContent);
        if (matches.length === 1) id = matches[0].id;
      }
      const link = current.links.find(l => l.playlistId === id);
      let badge = row.querySelector('[data-playlist-sync-badge]');
      if (!link) { badge?.remove(); continue; }
      if (!badge) {
        if (!label || row.querySelector('input')) continue;
        badge = document.createElement('button'); badge.type = 'button'; badge.dataset.playlistSyncBadge = 'true'; badge.textContent = '⇄';
        badge.addEventListener('mousedown', event => { event.stopPropagation(); event.preventDefault(); });
        badge.addEventListener('click', event => { event.stopPropagation(); open(badge.dataset.linkId); });
        label.after(badge);
      }
      const state = current.active === link.id ? 'busy' : link.status === 'synced' ? 'synced' : ['attention','failed','cancelled'].includes(link.status) ? 'attention' : 'linked';
      const title = state === 'synced' ? 'Synced · open playlist sync' : state === 'attention' ? `${link.message || 'Needs attention'} · open playlist sync` : state === 'busy' ? 'Syncing…' : 'Linked playlist · open playlist sync';
      if (badge.dataset.state !== state) badge.dataset.state = state;
      if (badge.title !== title) { badge.title = title; badge.setAttribute('aria-label', title); }
      if (badge.dataset.linkId !== link.id) badge.dataset.linkId = link.id;
    }
    schedulePosition();
  }
  const observer = new MutationObserver(() => { if (timer === null) timer = requestAnimationFrame(decorate); });
  observer.observe(document.body, { childList: true, subtree: true });
  const expiry = setInterval(() => { if (Date.now() > current.expiresAt) dispose(); }, 10000);
  function dispose() {
    stopped = true; observer.disconnect(); clearInterval(expiry); if (timer !== null) cancelAnimationFrame(timer);
    sizeObserver.disconnect(); if (layoutFrame !== null) cancelAnimationFrame(layoutFrame);
    document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape, true);
    window.removeEventListener('resize', position);
    window.visualViewport?.removeEventListener('resize', schedulePosition);
    window.visualViewport?.removeEventListener('scroll', schedulePosition);
    toolbar.remove(); popover.remove(); document.querySelectorAll('[data-playlist-sync-badge]').forEach(e => e.remove());
    for (const p of pending.values()) { clearTimeout(p.timeout); p.reject(Error('Playlist Sync closed')); } pending.clear();
    document.adoptedStyleSheets = document.adoptedStyleSheets.filter(s => s !== sheet); delete window[key];
  }
  window[key] = { version: 8, update(value) { current = value; panel.update(value); decorate(); if (value.open) open(); }, open, dispose,
    reply(id, result, error) { const p = pending.get(id); if (!p) return; clearTimeout(p.timeout); pending.delete(id); error ? p.reject(Error(error)) : p.resolve(result); } };
  decorate(); if (model.open) open();
  return { installed: true, visiblePlaylistBadges: document.querySelectorAll('[data-playlist-sync-badge]').length };
}
