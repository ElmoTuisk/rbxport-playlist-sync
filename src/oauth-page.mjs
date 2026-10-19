export function oauthPage(kind, message) {
  const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const title = kind === 'connected' ? 'Spotify connected' : kind === 'cancelled' ? 'Sign-in cancelled' : kind === 'start' ? 'Start from Playlist sync' : 'Spotify sign-in not completed';
  const instruction = kind === 'connected' ? 'You can close this tab and return to rbxport.' : 'In rbxport: Playlist sync below Tag List → ⚙ Settings → Connect Spotify → Connect.';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><link rel="stylesheet" href="/oauth.css"></head><body><main><span class="mark">${kind === 'connected' ? '✓' : '⇄'}</span><h1>${title}</h1><p>${escape(message)}</p><p class="instruction">${escape(instruction)}</p></main></body></html>`;
}
