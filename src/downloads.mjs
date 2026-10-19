import { mkdir, readdir, rename, stat, unlink } from 'node:fs/promises';
import { join, resolve, basename } from 'node:path';
import { createHash } from 'node:crypto';
import { run } from './process.mjs';
import { candidateFormats, inspectAudio } from './quality.mjs';
import { candidateCheck, durationCheck, searchVariants } from './matching.mjs';
import { mediaUrl } from './providers.mjs';

export class Downloads {
  constructor(settings, {runner = run} = {}) { this.settings = settings; this.runner = runner; }
  args() { const s = this.settings(); return ['--ignore-config', '--no-warnings', '--js-runtimes',`node:${process.execPath}`,'--socket-timeout','20','--retries','2','--fragment-retries','3', ...(s.cookiesFile ? ['--cookies', s.cookiesFile] : [])]; }
  async metadata(url, { playlist = false, signal, limit, search = false } = {}) {
    const s = this.settings();
    const result = await this.runner(s.ytdlp, [...this.args(), '--skip-download', '--dump-single-json', ...(playlist ? ['--yes-playlist','--ignore-errors',...(limit ? ['--playlist-end',String(limit)] : [])] : ['--no-playlist']), '--', url], { signal, timeout: search ? 90000 : playlist ? 900000 : 180000, maxBytes: 64 * 1024 * 1024 });
    return JSON.parse(result);
  }
  async *candidates(track, signal, report = () => {}) {
    const variants = searchVariants(track), query = variants.at(-1) || track;
    const sources = [
      ...(track.provider === 'soundcloud' ? [{name:'SoundCloud original',url:mediaUrl(track.url)}] : []),
      {name:'SoundCloud search',url:`scsearch5:${query.artist} ${query.title}`,playlist:true},
      {name:'Newgrounds search',url:`https://www.newgrounds.com/audio/search/title/${encodeURIComponent(query.title)}`,playlist:true,limit:5},
      {name:'YouTube search',url:`ytsearch5:${query.artist} ${track.title}`,playlist:true},
    ];
    const seen = new Set();
    for (const source of sources) {
      signal?.throwIfAborted();
      report({source:source.name,status:'searching',message:'Searching'});
      try {
        const result = await this.metadata(source.url,{...source,signal,search:true});
        const entries = result.entries || [result];
        if (!entries.filter(Boolean).length) report({source:source.name,status:'empty',message:'No search results'});
        for (const candidate of entries.filter(Boolean).slice(0,5)) {
          const key = candidate.webpage_url || candidate.original_url || `${source.name}:${candidate.id}`;
          if (seen.has(key)) continue; seen.add(key);
          yield {...candidate,discoverySource:source.name};
        }
      } catch (error) {
        if (signal?.aborted) throw error;
        report({source:source.name,status:'unavailable',message:/403|401|sign.in|login/i.test(error.message) ? 'Source blocked or requires sign-in' : /429|rate.limit/i.test(error.message) ? 'Source rate limited' : 'Source request failed; trying another source'});
      }
    }
  }
  async probe(path, signal) {
    return JSON.parse(await this.runner(this.settings().ffprobe, ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', path], { signal }));
  }
  async verify(path, track, signal, output = false) {
    const report = inspectAudio(await this.probe(path, signal), track.duration, { output, policy:this.settings().quality });
    if (!report.ok) throw new Error(`Quality check failed: ${report.issues.join('; ')}`);
    const decoded = await this.runner(this.settings().ffmpeg, ['-v', 'error', '-xerror', '-nostdin', '-nostats', '-i', path, '-map', '0:a:0', '-progress', 'pipe:1', '-f', 'null', '-'], { signal, timeout: 600000 });
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
    const attempts = [];
    const report = entry => { attempts.push(entry); if(attempts.length>30)attempts.shift(); update({attempts:[...attempts],message:`${entry.source}: ${entry.message}`}); };
    if (sourcePath) sourceReport = await this.verify(sourcePath, track, signal);
    else {
      update({ status: 'searching', message: 'Searching original sources and verifying candidate audio', attempts:[] });
      const candidates = job.overrideUrl ? [await this.metadata(mediaUrl(job.overrideUrl), { signal })] : this.candidates(track, signal, report);
      let downloads = 0;
      for await (const candidate of candidates) {
        signal?.throwIfAborted();
        const source = candidate.discoverySource || 'Selected source';
        const identity = candidateCheck(track,candidate,{allowUnknownDuration:true});
        const length = Number(candidate.duration) ? durationCheck(track.duration,candidate.duration) : {ok:true};
        if (!length.ok || (!identity.ok && !job.overrideUrl)) { report({source,status:'mismatch',message:length.reason || identity.reason}); continue; }
        const formats = candidateFormats(candidate,{policy:s.quality}).slice(0,2);
        if (!formats.length) { report({source,status:'quality',message:`Recording found, but no 320 kbps MP3${s.quality==='club-aac-256'?', 256 kbps AAC':''} or lossless format is offered`}); continue; }
        for (const format of formats) {
          if (++downloads > 8) break;
          let url;
          try {
            url = mediaUrl(candidate.webpage_url || candidate.original_url || track.url);
            const prefix = `source-${createHash('sha256').update(url+':'+format.format_id).digest('hex').slice(0,12)}.`;
            update({status:'downloading',progress:'',message:`Trying ${source}; actual file quality will be checked`});
            await this.runner(s.ytdlp, [...this.args(),'--no-playlist','--newline','--continue','--no-overwrites','--max-filesize','250M','-f',String(format.format_id || 'best'),
              '--progress-template','download:PROGRESS %(progress._percent_str)s %(progress._speed_str)s','-o',join(work,`${prefix}%(ext)s`),'--',url],{
              signal,timeout:600000,onLine:line=>{if(line.startsWith('PROGRESS '))update({progress:line.slice(9).trim()});},
            });
            const files = (await readdir(work)).filter(name=>name.startsWith(prefix)&&/\.(mp3|flac|wav|aiff|aif|m4a|aac|ogg|opus)$/i.test(name));
            if(files.length!==1)throw Error('No unique completed audio file');
            const file = join(work,files[0]);
            const actual = await this.verify(file,track,signal);
            sourcePath=file;sourceUrl=url;sourceReport=actual;
            update({sourcePath,sourceUrl,sourceReport,sourceFormat:{codec:actual.codec,bitrate:actual.bitrate}});
            report({source,status:'verified',message:'Actual audio passed identity, duration and quality checks'});break;
          } catch(error) {
            if(signal?.aborted)throw error;
            report({source,status:/Quality check/.test(error.message)?'quality':'failed',message:/^Quality check failed:/.test(error.message)?error.message.slice(0,350):'Candidate download failed; trying another candidate'});
          }
        }
        if(sourcePath || downloads>=8)break;
      }
      if(!sourcePath){
        const quality = attempts.some(a=>a.status==='quality'),blocked=attempts.some(a=>a.status==='unavailable');
        const error=Error(quality ? 'Recordings were found, but none passed your audio standard and recording checks.' : blocked ? 'No verified source yet. Some providers were unavailable; see the source attempts and retry later.' : 'No matching verified source found across the available searches.');
        error.code='QUALITY_REVIEW';error.attempts=attempts;throw error;
      }
    }
    const aac=sourceReport.codec==='aac',extension=aac?'m4a':'mp3';
    update({ status: 'validating', message: aac ? 'Verifying original AAC without re-encoding' : 'Checking audio and publishing 320 kbps MP3' });
    const temp = join(work, `output.${extension}`);
    await this.runner(s.ffmpeg, ['-y', '-v', 'error', '-nostdin', '-i', sourcePath, '-map', '0:a:0', '-map_metadata', '-1',
      ...(sourceReport.codec === 'mp3' || aac ? ['-c:a', 'copy'] : ['-c:a', 'libmp3lame', '-b:a', '320k']),
      '-metadata', `title=${track.title}`, '-metadata', `artist=${track.artist}`, temp], { signal, timeout: 600000 });
    const quality = await this.verify(temp, track, signal, true);
    const key = createHash('sha256').update(track.key).digest('hex').slice(0, 16);
    const safe = `${track.artist} - ${track.title}`.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').replace(/[. ]+$/g, '').slice(0, 130);
    const final = join(root, `${safe || 'Track'} [${key}].${extension}`);
    try { await stat(final); await this.verify(final, track, signal, true); await unlink(temp); }
    catch (error) { if (error.code === 'ENOENT') await rename(temp, final); else throw error; }
    return { file: final, quality, sourceUrl: sourceUrl || `local:${basename(sourcePath)}`, sourceReport,attempts };
  }
  async health() {
    const s = this.settings(); const results = {};
    for (const [name, flag] of [['ytdlp', '--version'], ['ffmpeg', '-version'], ['ffprobe', '-version']]) {
      try { results[name] = { ok: true, version: (await this.runner(s[name], [flag], { timeout: 15000 })).split('\n')[0] }; }
      catch (error) { results[name] = { ok: false, error: error.message }; }
    }
    return results;
  }
}
