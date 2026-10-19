import { createHash, randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, readFile, readdir, realpath, rename, unlink, writeFile } from 'node:fs/promises';
import { join, resolve, relative, isAbsolute, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { run } from './process.mjs';
import { candidateCheck } from './matching.mjs';

export function trackCsv(track) {
  const cell = value => `"${String(value ?? '').replaceAll('"','""')}"`;
  if (!track.title || !track.artist || !Number.isFinite(track.duration) || track.duration <= 0) throw Error('Soulseek needs a track title, artist and duration.');
  return `Title,Artist,Length\n${[track.title,track.artist,track.duration].map(cell).join(',')}\n`;
}

export function soulseekArgs(config, input, output, track) {
  return ['--config',config,'--input',input,'--input-type','csv','--song','--output-dir',output,
    '--name-format','{slsk-filename}','--format','mp3,flac,wav,aiff,alac','--min-bitrate','320',
    '--min-samplerate','44100','--strict-conditions','--strict-title','--strict-artist',
    '--length-tol',String(Math.max(3,Math.min(8,track.duration * .02))),
    '--concurrent-jobs','1','--concurrent-searches','1','--max-retries','3','--search-timeout','10000',
    '--searches-per-time','1','--searches-renew-time','12','--no-listen','--yt-dlp','false',
    '--no-write-index','--progress-json'];
}

async function sha256(path) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}

async function audioFiles(root, directory = root) {
  const result = [];
  for (const entry of await readdir(directory,{withFileTypes:true})) {
    if (entry.isSymbolicLink()) continue;
    const path = join(directory,entry.name);
    if (entry.isDirectory()) result.push(...await audioFiles(root,path));
    else if (entry.isFile() && /\.(mp3|flac|wav|aiff|aif|m4a)$/i.test(entry.name)) {
      const actual = await realpath(path), inside = relative(await realpath(root),actual);
      if (inside.startsWith('..') || isAbsolute(inside)) throw Error('Soulseek output escaped its staging folder.');
      result.push(actual);
    }
  }
  return result;
}

/** Optional downloader. Secrets remain local and never enter API models or command arguments. */
export class Soulseek {
  constructor(dataDir, vault, downloads, options = {}) {
    Object.assign(this,{vault,downloads}); this.directory = join(dataDir,'soulseek');
    this.account = null; this.nextSearch = 0; this.installing = null;
    this.runner = options.runner || run; this.clock = options.clock || (() => Date.now());
    this.toolOverride = options.tool || null;
  }
  async initialize() {
    await mkdir(this.directory,{recursive:true});
    // Clean only our transient authentication files after an interrupted previous run.
    for (const name of await readdir(this.directory)) if (/^auth-[a-f0-9-]+\.conf$/.test(name)) await unlink(join(this.directory,name));
    try { this.account = await this.vault.read(); } catch { this.account = null; }
  }
  publicStatus() { return {configured:Boolean(this.account?.username && this.account?.password),enabled:Boolean(this.account?.enabled),username:this.account?.username || ''}; }
  get enabled() { return Boolean(this.account?.enabled && this.account?.username && this.account?.password); }
  async configure(value) {
    const username = String(value.username || '').trim();
    const password = value.password || (username === this.account?.username ? this.account?.password : '');
    if (!username || !password || username.length > 128 || password.length > 256 || /[\r\n\0]/.test(username + password) || password.trim() !== password)
      throw Error('Enter your existing Soulseek username and password without line breaks or surrounding spaces.');
    this.account = {username,password,enabled:value.enabled !== false};
    await this.vault.write(this.account);
    return this.publicStatus();
  }
  async ensureTool(signal, update = () => {}) {
    if (this.toolOverride) return this.toolOverride;
    if (process.platform !== 'win32' || process.arch !== 'x64') throw Error('Automatic Soulseek tool setup currently supports Windows x64.');
    const manifest = JSON.parse(await readFile(fileURLToPath(new URL('../dependencies.json',import.meta.url)),'utf8'));
    const dependency = manifest.soulseek;
    const folder = join(this.directory,'tool',dependency.version), executable = join(folder,'sockseek.exe');
    try { if (await sha256(executable) === dependency.executableSha256) return executable; } catch (e) { if (e.code !== 'ENOENT') throw e; }
    if (this.installing) return this.installing;
    this.installing = (async () => {
      await mkdir(folder,{recursive:true});
      const archive = join(folder,'download.zip'), partial = `${archive}.partial`;
      let valid = false;
      try { valid = await sha256(archive) === dependency.sha256; } catch (e) { if (e.code !== 'ENOENT') throw e; }
      if (!valid) {
        update({status:'searching',message:'Preparing the verified Soulseek tool (one-time download)'});
        if (!dependency.url.startsWith('https://github.com/fiso64/sockseek/releases/download/')) throw Error('Unexpected Soulseek download source.');
        const response = await fetch(dependency.url,{signal:AbortSignal.any([signal,AbortSignal.timeout(180000)].filter(Boolean))});
        if (!response.ok || !response.body) throw Error('Could not download the Soulseek tool. Try again later.');
        let bytes = 0;
        const limit = new Transform({transform(chunk,encoding,done) { bytes += chunk.length; done(bytes > 80 * 1024 * 1024 ? Error('Soulseek archive exceeded expected size') : null,chunk); }});
        await pipeline(Readable.fromWeb(response.body),limit,createWriteStream(partial),{signal});
        if (await sha256(partial) !== dependency.sha256) throw Error('Soulseek tool checksum failed. Download was not executed.');
        await rename(partial,archive);
      }
      const extracted = `${executable}.partial`;
      const script = 'Add-Type -AssemblyName System.IO.Compression.FileSystem; $a=[Console]::In.ReadToEnd()|ConvertFrom-Json; $z=[IO.Compression.ZipFile]::OpenRead($a.archive); try { if($z.Entries.Count -ne 2){throw "Unexpected archive layout"}; foreach($n in @("sockseek.exe","LICENSE")){ $e=$z.GetEntry($n); if(!$e){throw "Missing archive entry"}; $p=if($n -eq "sockseek.exe"){$a.output}else{Join-Path $a.folder "LICENSE"}; [IO.Compression.ZipFileExtensions]::ExtractToFile($e,$p,$true) } } finally {$z.Dispose()}';
      await run('powershell.exe',['-NoProfile','-NonInteractive','-Command',script],{input:JSON.stringify({archive,output:extracted,folder}),signal,timeout:120000});
      if (await sha256(extracted) !== dependency.executableSha256) throw Error('Extracted Soulseek tool checksum failed.');
      await rename(extracted,executable);
      return executable;
    })();
    try { return await this.installing; } finally { this.installing = null; }
  }
  async acquire(track, job, update, signal) {
    signal?.throwIfAborted();
    if (!this.enabled) throw Error('Connect Soulseek in Settings before using the fallback.');
    if (!/^[a-f0-9]{64}$/.test(String(job.id))) throw Error('Invalid Soulseek job identifier.');
    let executable;
    try { executable = await this.ensureTool(signal,update); }
    catch (error) { error.code = 'SOULSEEK_SETUP'; throw error; }
    const wait = Math.max(0,this.nextSearch - this.clock());
    if (wait) { update({status:'searching',message:'Waiting for the next Soulseek search slot'}); await delay(wait,undefined,{signal}); }
    this.nextSearch = this.clock() + 12000;
    const folder = join(this.directory,'jobs',String(job.id),randomUUID()), output = join(folder,'audio');
    await mkdir(output,{recursive:true});
    const input = join(folder,'track.csv'), config = join(this.directory,`auth-${randomUUID()}.conf`);
    await writeFile(input,trackCsv(track),{mode:0o600});
    await writeFile(config,`username = ${this.account.username}\npassword = ${this.account.password}\n`,{mode:0o600});
    let authenticationFailed = false, terminalFailure = '';
    try {
      update({status:'searching',message:'Searching Soulseek for the correct recording at 320 kbps or lossless'});
      await this.runner(executable,soulseekArgs(config,input,output,track),{signal,timeout:900000,maxBytes:4 * 1024 * 1024,onLine:line => {
        // Only expose a bounded percentage, never raw downloader output or peer/account details.
        try {
          const event = JSON.parse(line), percent = Number(event.data?.percent ?? event.percent ?? event.percentage);
          if (event.type === 'track_state' && event.data?.terminalOutcome === 'Failed') terminalFailure = String(event.data.failureReason || '');
          if (event.type === 'error' && /invalid.{0,30}(password|credential|username)|login.{0,20}(failed|rejected)/i.test(String(event.data?.message || ''))) authenticationFailed = true;
          if (event.type === 'download_progress' && Number.isFinite(percent)) update({status:'downloading',progress:`${Math.max(0,Math.min(100,percent)).toFixed(0)}%`,message:'Downloading from Soulseek'});
        } catch {}
      }});
      signal?.throwIfAborted();
      const files = await audioFiles(output);
      if (files.length !== 1) throw Error('Soulseek found no unique completed audio file. No file was imported.');
      const sourcePath = files[0], probe = await this.downloads.probe(sourcePath,signal);
      const tags = probe.format?.tags || {}, length = Number(probe.streams?.find(s => s.codec_type === 'audio')?.duration || probe.format?.duration || 0);
      const identity = candidateCheck(track,{title:`${tags.title || tags.TITLE || ''} ${basename(sourcePath)}`,artist:tags.artist || tags.ARTIST || '',duration:length});
      if (!identity.ok) throw Error(`Soulseek file needs review: ${identity.reason}`);
      const sourceReport = await this.downloads.verify(sourcePath,track,signal);
      return {sourcePath,sourceReport,sourceUrl:`soulseek:job/${job.id}`};
    } catch (error) {
      if (signal?.aborted) throw Error('Cancelled');
      authenticationFailed ||= /invalid.{0,30}(password|credential|username)|login.{0,20}(failed|rejected)|password.{0,20}(incorrect|invalid)/i.test(error.message + terminalFailure);
      const trackFailure = Boolean(terminalFailure && !/connection|login|auth|network/i.test(terminalFailure));
      const known = !authenticationFailed && (trackFailure || /^(Soulseek (found|file)|Quality check failed)/.test(error.message));
      const failure = Error(known ? trackFailure ? 'Soulseek found no usable completed source for this recording. It remains in review.' : error.message : authenticationFailed ? 'Soulseek sign-in failed. Check your account in Settings before retrying.' : 'Soulseek connection failed. The batch stopped; check your account and connection, then retry.');
      failure.code = known ? 'QUALITY_REVIEW' : authenticationFailed ? 'SOULSEEK_AUTH' : 'SOULSEEK_CONNECTION'; throw failure;
    } finally { await unlink(config).catch(e => { if (e.code !== 'ENOENT') throw e; }); }
  }
}
