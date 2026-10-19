import { durationCheck } from './matching.mjs';

const LOSSLESS = /^(flac|alac|wav|aiff|pcm_)/i;
export function audioCodec(format) {
  const codec=String(format.acodec || format.codec_name || '').toLowerCase();
  return /^mp4a(?:\.|$)/.test(codec)?'aac':codec || ({mp3:'mp3',m4a:'aac',aac:'aac',opus:'opus',ogg:'vorbis'}[format.ext] || '');
}
export function sourceQuality(format, { policy = 'strict-mp3-320', allowLower = false } = {}) {
  const codec = String(format.acodec || format.codec_name || '').toLowerCase();
  const ext = String(format.ext || '').toLowerCase();
  const bitrate = Number(format.abr || Number(format.bit_rate || 0) / 1000);
  const lossless = LOSSLESS.test(codec) || (!codec && /^(flac|wav|aiff|alac)$/.test(ext));
  if (lossless) return { ok: true, kind: 'lossless', codec, bitrate, reason: 'Lossless source encoding; original recording provenance cannot be proven' };
  if(allowLower && ['mp3','aac','opus','vorbis'].includes(audioCodec(format)))
    return {ok:true,kind:'approved-lower',codec:audioCodec(format),bitrate,reason:'Per-song lower-quality exception; original audio is preserved'};
  if ((codec === 'mp3' || (!codec && ext === 'mp3')) && bitrate >= 319)
    return { ok: true, kind: 'mp3-320', codec, bitrate, reason: 'Source is encoded as 320 kbps MP3' };
  if(policy === 'club-aac-256' && /^(aac|mp4a(?:\.40\.[25])?)$/.test(codec) && bitrate>=255)
    return {ok:true,kind:'aac-256',codec,bitrate,reason:'Source is AAC at 256 kbps or higher; preserve its original audio'};
  return { ok: false, codec, bitrate, reason: `Source is ${codec || ext || 'unknown'}${bitrate ? ` at ${Math.round(bitrate)} kbps` : ''}. Requires 320 kbps MP3${policy==='club-aac-256'?', 256 kbps AAC':''} or lossless; upscaling is rejected.` };
}

export function chooseFormat(info) {
  const formats = (info.formats || [info]).filter(f => f.vcodec === 'none' || !f.vcodec);
  const usable = formats.filter(f => sourceQuality(f).ok);
  usable.sort((a, b) => Number(sourceQuality(b).kind === 'lossless') - Number(sourceQuality(a).kind === 'lossless') || Number(b.abr || 0) - Number(a.abr || 0));
  return usable[0] || null;
}

/** Missing remote bitrate is a reason to probe the file, not a reason to discard it. */
export function candidateFormats(info, options = {}) {
  const formats = (info.formats || [info]).filter(f=>!f.has_drm && (f.vcodec === 'none' || !f.vcodec));
  return formats.filter(f => sourceQuality(f,options).ok ||
    ((!f.acodec || ['mp3','unknown'].includes(f.acodec)) && f.ext === 'mp3' && !Number(f.abr || Number(f.bit_rate || 0)/1000)) ||
    (options.policy==='club-aac-256' && /^(aac|mp4a(?:\.40\.[25])?|unknown)?$/.test(f.acodec||'') && /^(m4a|aac)$/.test(f.ext||'') && !Number(f.abr || Number(f.bit_rate || 0)/1000)))
    .sort((a,b)=>Number(sourceQuality(b,options).ok)-Number(sourceQuality(a,options).ok) || Number(sourceQuality(b,options).kind==='lossless')-Number(sourceQuality(a,options).kind==='lossless') || Number(b.abr||0)-Number(a.abr||0));
}

export function lowerQualityFormats(info, options = {}) {
  return (info.formats || [info]).filter(f=>!f.has_drm && (f.vcodec==='none' || !f.vcodec) &&
    ['mp3','aac','opus','vorbis'].includes(audioCodec(f)) && !sourceQuality(f,options).ok)
    .sort((a,b)=>Number(b.abr || Number(b.bit_rate || 0)/1000)-Number(a.abr || Number(a.bit_rate || 0)/1000));
}

export function inspectAudio(probe, expectedDuration, { output = false, policy = 'strict-mp3-320', allowLower = false } = {}) {
  const streams = probe.streams?.filter(s => s.codec_type === 'audio') || [];
  const issues = [];
  if (streams.length !== 1) issues.push('Expected exactly one audio stream');
  const stream = streams[0] || {};
  const duration = Number(stream.duration || probe.format?.duration || 0);
  const length = durationCheck(expectedDuration, duration);
  if (!length.ok) issues.push(length.reason);
  if (Number(stream.sample_rate || 0) < 44100) issues.push('Sample rate is below 44.1 kHz');
  if (Number(stream.channels || 0) < 2) issues.push('Mono audio requires review');
  // Container bitrate is not evidence of audio quality: it can include artwork/video.
  const quality = sourceQuality(stream,{policy,allowLower});
  if (!quality.ok) issues.push(quality.reason);
  if (output && stream.codec_name !== 'mp3' && !(policy==='club-aac-256'&&stream.codec_name==='aac') && !(allowLower&&['aac','flac'].includes(stream.codec_name))) issues.push('Output must be MP3, allowed AAC or a playback-compatible approved FLAC');
  return { ok: issues.length === 0, issues, duration, codec: stream.codec_name,
    bitrate: Number(stream.bit_rate || 0) / 1000, sampleRate: Number(stream.sample_rate || 0), channels: stream.channels,
    provenance: quality.kind || 'unknown', belowStandard:!sourceQuality(stream,{policy}).ok };
}
