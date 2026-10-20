import { mountPanel } from './panel.mjs';
let token = location.hash.slice(1) || sessionStorage.getItem('playlist-sync-token') || '';
if (token) { sessionStorage.setItem('playlist-sync-token', token); history.replaceState(null, '', location.pathname + location.search); }
const root = document.querySelector('#playlist-sync-root');
let panel, revision = 0;
async function api(path, method = 'GET', body) {
  const response = await fetch(`/api/${path}`, { method, headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const value = await response.json(); if (!response.ok) throw Error(value.error || 'Request failed'); return value;
}
async function refresh() { const state = await api('panel'); revision = state.revision; panel ? panel.update(state) : panel = mountPanel(root, state, action); }
async function action(name, args = {}) {
  if (name === 'close') { window.close(); return; }
  const result = await api('action', 'POST', { action: name, args });
  if(result?.externalUrl){window.open(result.externalUrl,'_blank','noopener,noreferrer');return result;}
  if (result?.url) { location.assign(result.url); return; }
  await refresh(); return result;
}
async function watch() {
  while (true) {
    try { const state = await api(`events?after=${revision}`); if (state.revision !== revision) await refresh(); }
    catch (error) { panel?.showError(error.message); await new Promise(resolve => setTimeout(resolve, 5000)); }
  }
}
try { await refresh(); void watch(); } catch (error) { root.textContent = `${error.message} Open the Playlist Sync shortcut to reconnect.`; }
