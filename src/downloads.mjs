import { mkdir, readdir, rename, stat, unlink } from 'node:fs/promises';
import { join, resolve, basename } from 'node:path';
import { createHash } from 'node:crypto';
import { run } from './process.mjs';
import { chooseFormat, inspectAudio } from './quality.mjs';
import { candidateCheck, durationCheck } from './matching.mjs';
import { mediaUrl } from './providers.mjs';

export class Downloads {
  constructor(settings) { this.settings = settings; }
  args() { const s = this.settings(); return ['--ignore-config', '--no-warnings', ...(s.cookiesFile ? ['--cookies', s.cookiesFile] : [])]; }
  async metadata(url, { playlist = false, signal } = {}) {
    const s = this.settings();
    const result = await run(s.ytdlp, [...this.args(), '--skip-download', '--dump-single-json', ...(playlist ? ['--yes-playlist'] : ['--no-playlist']), '--', url], { signal, timeout: playlist ? 900000 : 180000, maxBytes: 64 * 1024 * 1024 });
    return JSON.parse(result);
  }
  async candidates(track, signal) {
    if (track.provider === 'soundcloud') return [await this.metadata(mediaUrl(track.url), { signal })];
    const result = await this.metadata(`ytsearch5:${track.artist} ${track.title} audio`, { signal });
    return result.entries || [result];
  }
  async probe(path, signal) {
    return JSON.parse(await run(this.settings().ffprobe, ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', path], { signal }));
  }
  async verify(path, track, signal, output = false) {
    const report = inspectAudio(await this.probe(path, signal), track.duration, { output });
    if (!report.ok) throw new Error(`Quality check failed: ${report.issues.join('; ')}`);
    // Decode every packet, not merely the header, to catch corrupt/truncated audio.
    const decoded = await run(this.settings().ffmpeg, ['-v', 'error', '-xerror', '-nostdin', '-nostats', '-i', path, '-map', '0:a:0', '-progress', 'pipe:1', '-f', 'null', '-'], { signal, timeout: 600000 });
    const times = [...decoded.matchAll(/^out_time_us=(\d+)\s*$/gm)];
    const decodedDuration = Number(times.at(-1)?.[1] || 0) / 1000000;
    const length = durationCheck(track.duration, decodedDuration);
    if (!length.ok) throw new Error(`Quality check failed: decoded audio ${length.reason}`);
    return { ...report, decodedDuration };
  }
  async acquire(track, job, update, signal) {
    const s = this.settings(), root = resolve(s.musicFolder), work = join(root, '.staging', job.id);
    await mkdir(work, { recursive: true });
    let sourcePath = job.sourcePath, sourceUrl = job.sourceUrl, sourceReport = job.sourceReport;
    if (sourcePath) {
      sourceReport = await this.verify(sourcePath, track, signal);
    } else {
      update({ status: 'searching', message: 'Checking candidate identity, duration and original quality' });
      const candidates = job.overrideUrl ? [await this.metadata(mediaUrl(job.overrideUrl), { signal })] : await this.candidates(track, signal);
      const rejected = []; let selected;
      for (const candidate of candidates) {
        const length = durationCheck(track.duration, candidate.duration);
        if (!length.ok) { rejected.push(`${candidate.title}: ${length.reason}`); continue; }
        const identity = candidateCheck(track, candidate);
        if (!identity.ok && !job.overrideUrl) { rejected.push(`${candidate.title}: ${identity.reason}`); continue; }
        // An explicit source override accepts its identity, but never bypasses duration/quality.
        const format = chooseFormat(candidate);
        if (!format) { rejected.push(`${candidate.title}: no 320 kbps MP3 or lossless source`); continue; }
        selected = { candidate, format }; break;
      }
      if (!selected) { const error = new Error(`No acceptable source. ${rejected.slice(0, 5).join(' | ')}`); error.code = 'QUALITY_REVIEW'; throw error; }
      const { candidate, format } = selected;
      sourceUrl = mediaUrl(candidate.webpage_url || candidate.original_url || track.url);
      update({ status: 'downloading', sourceUrl, sourceFormat: { codec: format.acodec, bitrate: format.abr }, message: 'Downloading original audio' });
      const prefix = `source-${createHash('sha256').update(sourceUrl).digest('hex').slice(0, 12)}.`;
      await run(s.ytdlp, [...this.args(), '--no-playlist', '--newline', '--continue', '--no-overwrites', '-f', String(format.format_id),
        '--progress-template', 'download:PROGRESS %(progress._percent_str)s %(progress._speed_str)s', '-o', join(work, `${prefix}%(ext)s`), '--', sourceUrl], {
        signal, timeout: 1800000, onLine: line => { if (line.startsWith('PROGRESS ')) update({ progress: line.slice(9).trim() }); },
      });
      const files = (await readdir(work)).filter(name => name.startsWith(prefix) && /\.(mp3|flac|wav|aiff|aif|m4a|ogg|opus)$/i.test(name));
      if (files.length !== 1) throw new Error('Downloader did not produce exactly one supported audio file');
      sourcePath = join(work, files[0]);
      sourceReport = await this.verify(sourcePath, track, signal);
      update({ sourcePath, sourceUrl, sourceReport });
    }
    update({ status: 'validating', message: 'Checking audio and publishing 320 kbps MP3' });
    const temp = join(work, 'output.mp3');
    await run(s.ffmpeg, ['-y', '-v', 'error', '-nostdin', '-i', sourcePath, '-map', '0:a:0', '-map_metadata', '-1',
      ...(sourceReport.codec === 'mp3' ? ['-c:a', 'copy'] : ['-c:a', 'libmp3lame', '-b:a', '320k']),
      '-metadata', `title=${track.title}`, '-metadata', `artist=${track.artist}`, temp], { signal, timeout: 600000 });
    const quality = await this.verify(temp, track, signal, true);
    const key = createHash('sha256').update(track.key).digest('hex').slice(0, 16);
    const safe = `${track.artist} - ${track.title}`.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').replace(/[. ]+$/g, '').slice(0, 130);
    const final = join(root, `${safe || 'Track'} [${key}].mp3`);
    // Never replace a previously published track, which may already carry cues.
    try { await stat(final); await this.verify(final, track, signal, true); await unlink(temp); }
    catch (error) { if (error.code === 'ENOENT') await rename(temp, final); else throw error; }
    return { file: final, quality, sourceUrl: sourceUrl || `local:${basename(sourcePath)}`, sourceReport };
  }
  async health() {
    const s = this.settings(); const results = {};
    for (const [name, flag] of [['ytdlp', '--version'], ['ffmpeg', '-version'], ['ffprobe', '-version']]) {
      try { results[name] = { ok: true, version: (await run(s[name], [flag], { timeout: 15000 })).split('\n')[0] }; }
      catch (error) { results[name] = { ok: false, error: error.message }; }
    }
    return results;
  }
}
