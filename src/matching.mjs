export function normalize(value = '') {
  return value.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase()
    .replace(/&/g, ' and ').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

function words(value) { return new Set(normalize(value).split(' ').filter(Boolean)); }
function similarity(a, b) {
  const x = words(a), y = words(b);
  if (!x.size || !y.size) return 0;
  return 2 * [...x].filter(w => y.has(w)).length / (x.size + y.size);
}

function recordingTitle(title, artist) {
  let text = normalize(title).replace(/\bfree (download|dl|dowload)\b/g, '').trim();
  const prefix = primaryArtist(artist);
  if (prefix && text.startsWith(`${prefix} `)) text = text.slice(prefix.length + 1);
  return text.replace(/\s+/g, ' ').trim();
}
function primaryArtist(artist = '') { return normalize(artist.split(/[,，]|\s+feat\.?\s+/i)[0]); }

export function version(title = '') {
  const text = normalize(title);
  const labels = ['extended', 'radio', 'remix', 'rework', 'bootleg', 'edit', 'vip', 'dub', 'live', 'acoustic', 'instrumental', 'clean', 'sped up', 'slowed', 'remaster'];
  return labels.filter(label => new RegExp(`\\b${label}\\b`).test(text)).join('|');
}

export function durationCheck(expected, actual, tolerance = 3) {
  if (!Number.isFinite(expected) || !Number.isFinite(actual) || expected <= 0 || actual <= 0)
    return { ok: false, reason: 'Duration is unknown; manual review required.' };
  const difference = Math.abs(expected - actual);
  const limit = Math.max(tolerance, Math.min(8, expected * 0.02));
  return { ok: difference <= limit, difference, limit,
    reason: difference <= limit ? '' : `Duration differs by ${difference.toFixed(1)}s (limit ${limit.toFixed(1)}s).` };
}

export function scoreMatch(source, local) {
  const sourceTitle = recordingTitle(source.title, source.artist), localTitle = recordingTitle(local.title, local.artist);
  const title = similarity(sourceTitle, localTitle);
  const artist = similarity(source.artist, local.artist);
  const duration = durationCheck(source.duration, local.duration);
  const sameVersion = version(source.title) === version(`${local.title} ${local.mixName || ''}`);
  const sameIsrc = Boolean(source.isrc && local.isrc && source.isrc === local.isrc);
  const exact = sourceTitle === localTitle && primaryArtist(source.artist) === primaryArtist(local.artist);
  const score = title * 0.5 + artist * 0.35 + (duration.ok ? 0.15 : 0);
  // Ambiguous or differently labelled mixes never auto-match, even with an ISRC.
  const certain = sameVersion && duration.ok && ((exact && artist > 0) || (sameIsrc && title > 0.8 && artist > 0.8));
  return { local, score, certain, reason: !sameVersion ? 'Different version or mix' : !duration.ok ? duration.reason : !certain ? 'Similar metadata; confirm this match' : 'Artist, recording and duration match' };
}

export function matchTrack(source, library, binding, targetIds = new Set()) {
  if (binding?.ignored) return { status: 'ignored', reason: 'Ignored by you', candidates: [] };
  if (binding?.localId) {
    const found = library.find(t => t.id === binding.localId);
    if (found) return { status: found.missing ? 'missing_file' : 'matched', localId: found.id,
      reason: found.missing ? 'Linked file is unavailable; reconnect or relocate it' : 'Your saved match', candidates: [] };
  }
  const ranked = library.map(t => scoreMatch(source, t)).filter(t => t.score >= 0.66).sort((a, b) => b.score - a.score);
  let certain = ranked.filter(t => t.certain);
  const inTarget = certain.filter(t => targetIds.has(t.local.id));
  if (inTarget.length === 1) certain = inTarget;
  if (certain.length === 1) return { status: certain[0].local.missing ? 'missing_file' : 'matched', localId: certain[0].local.id,
    reason: certain[0].local.missing ? 'Matching track has an unavailable file' : certain[0].reason, candidates: ranked.slice(0, 5) };
  if (ranked.length) return { status: 'review', reason: certain.length > 1 ? 'Multiple versions or files match' : ranked[0].reason, candidates: ranked.slice(0, 5) };
  return { status: 'missing', reason: 'No confident match in your library', candidates: [] };
}

/** Source recordings first; preserve every extra occurrence in its current order. */
export function playlistOrder(sourceIds, currentIds) {
  const remaining = [...currentIds], front = [];
  for (const id of new Set(sourceIds)) {
    const index = remaining.indexOf(id);
    if (index >= 0) { front.push(id); remaining.splice(index, 1); }
  }
  return { ids: [...front, ...remaining], extraCount: remaining.length,
    changed: [...front, ...remaining].some((id, index) => id !== currentIds[index]) };
}

export function candidateCheck(track, candidate) {
  const length = durationCheck(track.duration, candidate.duration);
  if (!length.ok) return length;
  if (candidate.is_live || candidate.live_status === 'is_live') return { ok: false, reason: 'Live stream' };
  if (/\b(preview|teaser|snippet|full album|full set|compilation|tutorial|reaction)\b/i.test(candidate.title || ''))
    return { ok: false, reason: 'Preview, compilation or non-song video' };
  if (version(track.title) !== version(candidate.title)) return { ok: false, reason: 'Candidate has a different mix/version' };
  const titleWords = words(track.title);
  const all = words(`${candidate.title} ${candidate.artist || ''} ${candidate.uploader || ''}`);
  const titleRatio = [...titleWords].filter(w => all.has(w)).length / Math.max(1, titleWords.size);
  const artistWords = words(track.artist);
  const artistRatio = [...artistWords].filter(w => all.has(w)).length / Math.max(1, artistWords.size);
  return { ok: titleRatio >= 0.9 && artistRatio >= 0.75,
    reason: titleRatio >= 0.9 && artistRatio >= 0.75 ? '' : 'Artist/title does not confidently match' };
}
