import { durationCheck } from './matching.mjs';

const LOSSLESS = /^(flac|alac|wav|aiff|pcm_)/i;
export function sourceQuality(format) {
  const codec = String(format.acodec || format.codec_name || '').toLowerCase();
  const ext = String(format.ext || '').toLowerCase();
  const bitrate = Number(format.abr || Number(format.bit_rate || 0) / 1000);
  const lossless = LOSSLESS.test(codec) || (!codec && /^(flac|wav|aiff|alac)$/.test(ext));
  if (lossless) return { ok: true, kind: 'lossless', codec, bitrate, reason: 'Lossless source encoding; original recording provenance cannot be proven' };
  if ((codec === 'mp3' || (!codec && ext === 'mp3')) && bitrate >= 319)
    return { ok: true, kind: 'mp3-320', codec, bitrate, reason: 'Source is encoded as 320 kbps MP3' };
  return { ok: false, codec, bitrate, reason: `Source is ${codec || ext || 'unknown'}${bitrate ? ` at ${Math.round(bitrate)} kbps` : ''}. Requires 320 kbps MP3 or lossless; upscaling is rejected.` };
}

export function chooseFormat(info) {
  const formats = (info.formats || [info]).filter(f => f.vcodec === 'none' || !f.vcodec);
  const usable = formats.filter(f => sourceQuality(f).ok);
  usable.sort((a, b) => Number(sourceQuality(b).kind === 'lossless') - Number(sourceQuality(a).kind === 'lossless') || Number(b.abr || 0) - Number(a.abr || 0));
  return usable[0] || null;
}

export function inspectAudio(probe, expectedDuration, { output = false } = {}) {
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
  const quality = sourceQuality(stream);
  if (!quality.ok) issues.push(quality.reason);
  if (output && stream.codec_name !== 'mp3') issues.push('Output must be MP3');
  return { ok: issues.length === 0, issues, duration, codec: stream.codec_name,
    bitrate: Number(stream.bit_rate || 0) / 1000, sampleRate: Number(stream.sample_rate || 0), channels: stream.channels,
    provenance: quality.kind || 'unknown' };
}
