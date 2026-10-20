import { mkdir, readdir, rename, stat, unlink } from 'node:fs/promises';
import { join, resolve, basename } from 'node:path';
import { createHash } from 'node:crypto';
import { run } from './process.mjs';
import { candidateFormats, inspectAudio, lowerQualityFormats, audioCodec, officialFormat, previewFormat } from './quality.mjs';
import { SoundCloudPages } from './soundcloud.mjs';
import { candidateCheck, durationCheck, searchVariants } from './matching.mjs';
import { mediaUrl } from './providers.mjs';
import {Artwork} from './artwork.mjs';

export class Downloads {
  constructor(settings, {runner = run, fetcher = fetch, clock = Date.now} = {}) { this.settings = settings; this.runner = runner; this.clock=clock; this.pages=new SoundCloudPages(fetcher,{clock}); this.metadataCache=new Map();this.artwork=new Artwork({settings,runner,fetcher,clock}); }
  cache(info) {
    if(!info.webpage_url || !/^soundcloud(?::|$)/i.test(info.extractor || info.extractor_key || ''))return;
    const keys=['id','title','track','artist','uploader','duration','webpage_url','original_url','extractor','extractor_key','_has_drm','has_drm','is_live','live_status','sourcePreview','durationUnverified','officialDownload'];
    const compact=Object.fromEntries(keys.filter(k=>info[k]!==undefined).map(k=>[k,info[k]]));
    compact.formats=(info.formats || []).filter(f=>!f.vcodec || f.vcodec==='none').slice(0,64).map(f=>Object.fromEntries(['format_id','acodec','codec_name','ext','vcodec','abr','bit_rate','has_drm','format_note','protocol'].filter(k=>f[k]!==undefined).map(k=>[k,f[k]])));
    this.metadataCache.delete(info.webpage_url);this.metadataCache.set(info.webpage_url,{info:compact,expires:this.clock()+300000,cookies:this.settings().cookiesFile});
    while(this.metadataCache.size>128)this.metadataCache.delete(this.metadataCache.keys().next().value);
  }
  async enrich(info,signal,{fetchMissing=true}={}) {
    if(!/^soundcloud(?::|$)/i.test(info.extractor || info.extractor_key || ''))return info;
    const hint=await this.pages.track(info,signal,{fetchMissing});
    const preview=info.formats?.length>0 && info.formats.every(previewFormat);
    return {...info,...(hint?.duration>0?{duration:hint.duration}:{}),sourcePreview:preview || Boolean(hint?.preview),durationUnverified:preview&&!hint?.duration,
      officialDownload:{enabled:Boolean(hint?.downloadable),external:Boolean(hint?.external),title:hint?.downloadTitle || 'Artist download',available:info.formats?.some(f=>officialFormat(info,f)) || false}};
  }
  args() { const s = this.settings(); return ['--ignore-config', '--no-warnings', '--js-runtimes',`node:${process.execPath}`,'--socket-timeout','20','--retries','2','--fragment-retries','3', ...(s.cookiesFile ? ['--cookies', s.cookiesFile] : [])]; }
  async metadata(url, { playlist = false, signal, limit, search = false } = {}) {
    const s = this.settings();
    signal?.throwIfAborted();
    const cached=!playlist && this.metadataCache.get(url);
    if(cached && cached.expires>this.clock() && cached.cookies===s.cookiesFile)return this.enrich(cached.info,signal);
    // Reading a playlist is independent of playable formats. Keep protected/unplayable
    // tracks as metadata so one source cannot prevent local matching or other sources.
    // This flag is deliberately absent from actual download commands.
    const result = await this.runner(s.ytdlp, [...this.args(), '--skip-download', '--dump-single-json', '--ignore-no-formats-error', ...(playlist ? ['--yes-playlist',...(search ? ['--ignore-errors'] : []),...(limit ? ['--playlist-end',String(limit)] : [])] : ['--no-playlist']), '--', url], { signal, timeout: search ? 90000 : playlist ? 900000 : 180000, maxBytes: 64 * 1024 * 1024 });
    const info=JSON.parse(result);
    if(playlist && /soundcloud/i.test(info.extractor || info.extractor_key || '')){
      await this.pages.read(url,signal);
      const entries=[];
      // Only preview-only entries need another page request during a playlist read.
      for(const entry of info.entries || []){if(!entry){entries.push(entry);continue;}const value=await this.enrich(entry,signal,{fetchMissing:entry.formats?.length>0&&entry.formats.every(previewFormat)});this.cache(value);entries.push(value);}
      return {...info,entries};
    }
    if(!playlist){const value=await this.enrich(info,signal);this.cache(value);return value;}
    return info;
  }
  sourceInfo(track,info) {
    const options={policy:this.settings().quality,allowLowerOfficial:this.settings().allowLowerOfficial!==false};
    return {normal:candidateFormats(info,options).length>0,lowerOptions:lowerQualityFormats(info,options).slice(0,3).map(f=>this.lowerOption(track,info,f)),
      preview:Boolean(info.sourcePreview),durationUnverified:Boolean(info.durationUnverified),officialDownload:info.officialDownload,
      unavailable:!info.formats?.length};
  }
  async *candidates(track, signal, report = () => {}) {
    const variants = searchVariants(track), primary = variants[1] || variants[0] || track, query=variants.at(-1) || track;
    const sources = [
      ...(track.provider === 'soundcloud' ? [{name:'SoundCloud original',url:mediaUrl(track.url)}] : []),
      {name:'SoundCloud search',url:`scsearch10:${primary.artist} ${primary.title}`,playlist:true},
      {name:'Newgrounds search',url:`https://www.newgrounds.com/audio/search/title/${encodeURIComponent(query.title)}`,playlist:true,limit:5},
      {name:'YouTube search',url:`ytsearch10:${primary.artist} ${primary.title}`,playlist:true},
      // Lazy fallbacks run only if the earlier candidates supplied no verified
      // file. Keep version/remixer words in the first query; broaden only later.
      ...variants.filter(q=>q.artist!==primary.artist || q.title!==primary.title).slice(0,2).flatMap(q=>[
        {name:'SoundCloud alternate search',url:`scsearch5:${q.artist} ${q.title}`,playlist:true},
        {name:'YouTube alternate search',url:`ytsearch5:${q.artist} ${q.title}`,playlist:true},
      ]),
    ];
    const seen = new Set();
    for (const source of sources) {
      signal?.throwIfAborted();
      report({source:source.name,status:'searching',message:'Searching'});
      try {
        const result = await this.metadata(source.url,{...source,signal,search:true});
        const entries = result.entries || [result];
        if (!entries.filter(Boolean).length) report({source:source.name,status:'empty',message:'No search results'});
        for (const candidate of entries.filter(Boolean).slice(0,source.name==='Newgrounds search'?5:10)) {
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
  async verify(path, track, signal, output = false, {allowLower=false} = {}) {
    const report = inspectAudio(await this.probe(path, signal), track.duration, { output, policy:this.settings().quality,allowLower });
    if (!report.ok) throw new Error(`Quality check failed: ${report.issues.join('; ')}`);
    const decoded = await this.runner(this.settings().ffmpeg, ['-v', 'error', '-xerror', '-nostdin', '-nostats', '-i', path, '-map', '0:a:0', '-progress', 'pipe:1', '-f', 'null', '-'], { signal, timeout: 600000 });
    const times = [...decoded.matchAll(/^out_time_us=(\d+)\s*$/gm)];
    const decodedDuration = Number(times.at(-1)?.[1] || 0) / 1000000;
    const length = durationCheck(track.duration, decodedDuration);
    if (!length.ok) throw new Error(`Quality check failed: decoded audio ${length.reason}`);
    return { ...report, decodedDuration };
  }
  lowerOption(track,candidate,format,{stagedPath,report}={}) {
    const url=candidate.localFile?null:mediaUrl(candidate.webpage_url || candidate.original_url || track.url),codec=report?.codec || audioCodec(format);
    const bitrate=report?Number(report.bitrate || 0):Number(format.abr || Number(format.bit_rate || 0)/1000),formatId=String(format.format_id || 'bestaudio');
    const details={url,formatId,codec,bitrate:Math.round(bitrate || 0),duration:report?.duration || Number(candidate.duration || 0),title:candidate.title || track.title,
      label:`${codec.toUpperCase()} · ${bitrate?Math.round(bitrate)+' kbps':'bitrate not reported'}${report?' · verified file':' · reported'}${['opus','vorbis'].includes(codec)?' · FLAC for playback':''}`,...(stagedPath?{stagedPath}:{}),verified:Boolean(report)};
    return {...details,id:createHash('sha256').update(JSON.stringify({key:track.key,...details})).digest('hex')};
  }
  async inspectSource(track,url,signal) {
    const candidate=await this.metadata(mediaUrl(url),{signal,search:true});
    if(Number(candidate.duration)&&!durationCheck(track.duration,Number(candidate.duration)).ok)throw Error(`Selected source length does not match. ${durationCheck(track.duration,Number(candidate.duration)).reason}`);
    if(candidate.sourcePreview && !candidate.formats?.some(f=>!previewFormat(f)))throw Error('This source only offers a preview, not the complete recording. Choose a full-length source.');
    const normal=candidateFormats(candidate,{policy:this.settings().quality,allowLowerOfficial:this.settings().allowLowerOfficial!==false}).length>0;
    const lowerOptions=lowerQualityFormats(candidate,{policy:this.settings().quality}).slice(0,4).map(f=>this.lowerOption(track,candidate,f));
    if(!normal&&!lowerOptions.length)throw Error(candidate._has_drm || candidate.has_drm?'Selected source is DRM-protected. Choose another URL.':'Selected source offers no supported audio format. Your URL has been kept.');
    return {normal,lowerOptions};
  }
  async acquire(track, job, update, signal) {
    if(track.sourceAudio?.durationUnverified)throw Object.assign(Error('SoundCloud exposed only a preview and the full recording length could not be verified. Refresh the source or select a complete local recording.'),{code:'QUALITY_REVIEW'});
    const s = this.settings(), root = resolve(s.musicFolder), work = join(root, '.staging', job.id);
    await mkdir(work, { recursive: true });
    let sourcePath = job.sourcePath, sourceUrl = job.sourceUrl, sourceReport = job.sourceReport;
    const attempts = [],lowerOptions=[...(job.lowerOptions || [])],approval=job.qualityApproval,verifyOptions={allowLower:Boolean(approval || (job.sourceReport?.officialOriginal && s.allowLowerOfficial!==false))};
    const offer=option=>{
      const existing=lowerOptions.findIndex(o=>o.url===option.url&&o.formatId===option.formatId);
      if(existing>=0){if(lowerOptions[existing].verified&&!option.verified)return;lowerOptions.splice(existing,1);}
      lowerOptions.push(option);update({lowerOptions:lowerOptions.slice(-12)});
    };
    const report = entry => { attempts.push(entry); if(attempts.length>30)attempts.shift(); update({attempts:[...attempts],message:`${entry.source}: ${entry.message}`}); };
    const checkApproval=async(path,candidate,format)=>{
      const original=officialFormat(candidate,format) && s.allowLowerOfficial!==false;
      const actual=await this.verify(path,track,signal,false,{allowLower:verifyOptions.allowLower || original});
      if(approval && (actual.codec!==approval.codec || (approval.bitrate && (!actual.bitrate || actual.bitrate<approval.bitrate*.9)))){
        offer(this.lowerOption(track,candidate,format,{stagedPath:path,report:actual}));
        update({qualityApproval:null,sourcePath:null,sourceReport:null});
        throw Object.assign(Error('The source quality changed. Confirm the newly verified lower-quality file before importing.'),{code:'LOWER_CONFIRM'});
      }return {...actual,...(original?{officialOriginal:true}:{})};
    };
    if (sourcePath) { const wasOfficial=sourceReport?.officialOriginal;sourceReport = await checkApproval(sourcePath,{localFile:!approval?.url && !job.overrideUrl,webpage_url:sourceUrl || approval?.url || track.url,title:track.title,duration:track.duration},{format_id:approval?.formatId || 'local'});if(wasOfficial)sourceReport.officialOriginal=true; }
    else {
      update({ status: 'searching', message: 'Searching original sources and verifying candidate audio', attempts:[],originalOnly:false });
      const candidates = job.overrideUrl ? [await this.metadata(mediaUrl(job.overrideUrl), { signal })] : this.candidates(track, signal, report);
      let downloads = 0;
      for await (const candidate of candidates) {
        signal?.throwIfAborted();
        const source = candidate.discoverySource || 'Selected source';
        if(candidate.officialDownload)update({officialDownload:candidate.officialDownload});
        if(candidate.officialDownload?.external)report({source:'Artist download page',status:'manual',message:'Artist links to an external download page. Open View official download to complete its download steps; external gates are not submitted automatically.'});
        if(candidate.sourcePreview && !candidate.formats?.some(f=>!previewFormat(f))){report({source,status:'preview',message:'Only a preview is playable here; checking full-length sources instead'});continue;}
        if(candidate.officialDownload?.enabled && !candidate.officialDownload.available)report({source:'SoundCloud official download',status:'sign-in',message:'Artist enabled an original download, but it is unavailable to this session. Sign in on SoundCloud or supply a cookies file; other sources will still be checked.'});
        const identity = candidateCheck(track,candidate,{allowUnknownDuration:true});
        const length = Number(candidate.duration) ? durationCheck(track.duration,candidate.duration) : {ok:true};
        if (!length.ok || (!identity.ok && !job.overrideUrl)) { report({source,status:'mismatch',message:length.reason || identity.reason}); continue; }
        const low=lowerQualityFormats(candidate,{policy:s.quality});
        for(const format of low.slice(0,3))offer(this.lowerOption(track,candidate,format));
        const formats = approval ? (candidate.formats || [candidate]).filter(f=>!f.has_drm && !previewFormat(f) && String(f.format_id || 'bestaudio')===approval.formatId).slice(0,1) : candidateFormats(candidate,{policy:s.quality,allowLowerOfficial:s.allowLowerOfficial!==false}).slice(0,2);
        if (!formats.length && (candidate._has_drm || candidate.has_drm || candidate.formats?.some(f=>f.has_drm))) {
          report({source,status:'protected',message:'Source is DRM-protected; trying other sources'});continue;
        }
        if (!formats.length) { report({source,status:'quality',message:`Recording found, but no 320 kbps MP3${s.quality==='club-aac-256'?', 256 kbps AAC':''} or lossless format is offered`}); continue; }
        for (const format of formats) {
          if (++downloads > 8) break;
          let url;
          try {
            url = mediaUrl(candidate.webpage_url || candidate.original_url || track.url);
            const prefix = `source-${createHash('sha256').update(url+':'+format.format_id).digest('hex').slice(0,12)}.`;
            update({status:'downloading',progress:'',message:officialFormat(candidate,format)?'Downloading the artist-enabled SoundCloud original; checking actual audio':`Trying ${source}; actual file quality will be checked`});
            await this.runner(s.ytdlp, [...this.args(),'--no-playlist','--newline','--continue','--no-overwrites','--max-filesize','250M','-f',String(format.format_id || 'best'),
              '--progress-template','download:PROGRESS %(progress._percent_str)s %(progress._speed_str)s','-o',join(work,`${prefix}%(ext)s`),'--',url],{
              signal,timeout:600000,onLine:line=>{if(line.startsWith('PROGRESS '))update({progress:line.slice(9).trim()});},
            });
            const files = (await readdir(work)).filter(name=>name.startsWith(prefix)&&/\.(mp3|flac|wav|aiff|aif|m4a|aac|ogg|opus)$/i.test(name));
            if(files.length!==1)throw Error('No unique completed audio file');
            const file = join(work,files[0]);
            let actual;
            try{actual=await checkApproval(file,candidate,format);}
            catch(error){
              if(!approval && /^Quality check/.test(error.message))try{
                const lower=await this.verify(file,track,signal,false,{allowLower:true});
                if(lower.belowStandard)offer(this.lowerOption(track,candidate,format,{stagedPath:file,report:lower}));
              }catch{/* Invalid audio/length is never offered as a bitrate exception. */}
              throw error;
            }
            sourcePath=file;sourceUrl=url;sourceReport=actual;
            update({sourcePath,sourceUrl,sourceReport,sourceFormat:{codec:actual.codec,bitrate:actual.bitrate}});
            report({source,status:'verified',message:'Actual audio passed identity, duration and quality checks'});break;
          } catch(error) {
            if(signal?.aborted || error.code==='LOWER_CONFIRM')throw error;
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
    if(sourceReport.officialOriginal && s.allowLowerOfficial!==false)verifyOptions.allowLower=true;
    const aac=sourceReport.codec==='aac',compatibility=['opus','vorbis'].includes(sourceReport.codec),copy=['mp3','aac'].includes(sourceReport.codec),extension=compatibility?'flac':aac?'m4a':'mp3';
    update({ status: 'validating', message: compatibility?'Decoding approved source to FLAC for rbxport playback; original quality stays labelled':copy?'Preserving original compressed audio; verifying real quality':'Checking audio and publishing 320 kbps MP3' });
    const temp = join(work, `output.${extension}`);
    const cover=await this.artwork.prepare(track,sourcePath,work,signal);
    const publish=picture=>this.runner(s.ffmpeg, ['-y', '-v', 'error', '-nostdin', '-i', sourcePath,...(picture?['-i',picture]:[]), '-map', '0:a:0',...(picture?['-map','1:v:0','-c:v','copy','-disposition:v:0','attached_pic','-metadata:s:v:0','title=Album cover','-metadata:s:v:0','comment=Cover (front)']:[]), '-map_metadata', '-1',
      ...(copy ? ['-c:a', 'copy'] : compatibility?['-c:a','flac','-sample_fmt','s32']:['-c:a', 'libmp3lame', '-b:a', '320k']),
      '-metadata', `title=${track.title}`, '-metadata', `artist=${track.artist}`,
      ...(track.album?['-metadata',`album=${track.album}`]:[]),...(extension==='mp3'?['-id3v2_version','3']:[]),
      ...(sourceReport.belowStandard?['-metadata',`comment=Approved lower-quality source: ${sourceReport.codec.toUpperCase()} ${sourceReport.bitrate?Math.round(sourceReport.bitrate)+' kbps':'bitrate unknown'}${compatibility?'; decoded to FLAC for playback, not a lossless original':''}`]:[]),temp], { signal, timeout: 600000 });
    try{await publish(cover.path);}catch(error){if(!cover.path || signal?.aborted)throw error;cover.path=null;await publish(null);}
    const outputQuality = await this.verify(temp, track, signal, true,verifyOptions);
    const quality={...outputQuality,belowStandard:Boolean(sourceReport.belowStandard),sourceCodec:sourceReport.codec,sourceBitrate:sourceReport.bitrate,officialOriginal:Boolean(sourceReport.officialOriginal)};
    const key = createHash('sha256').update(track.key).digest('hex').slice(0, 16);
    const safe = `${track.artist} - ${track.title}`.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').replace(/[. ]+$/g, '').slice(0, 130);
    const qualityLabel=quality.belowStandard?` [LOWER ${sourceReport.codec.toUpperCase()} ${sourceReport.bitrate?Math.round(sourceReport.bitrate)+'k':'bitrate-unknown'}]`:'';
    const final = join(root, `${safe || 'Track'} [${key}]${qualityLabel}.${extension}`);
    try { await stat(final); await this.verify(final, track, signal, true,verifyOptions); await unlink(temp); }
    catch (error) { if (error.code === 'ENOENT') await rename(temp, final); else throw error; }
    let embedded=false;
    if(cover.path){const probe=await this.probe(final,signal);embedded=probe.streams?.some(v=>v.codec_type==='video'&&v.disposition?.attached_pic) || false;}
    const artwork=embedded?{status:'embedded',source:cover.source}:{status:'unavailable',message:'Album cover unavailable; audio download kept'};
    return { file: final, quality, artwork, sourceUrl: sourceUrl || `local:${basename(sourcePath)}`, sourceReport,attempts };
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
