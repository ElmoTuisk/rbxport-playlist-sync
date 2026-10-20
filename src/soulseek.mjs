import {createHash,randomUUID} from 'node:crypto';
import {createReadStream,createWriteStream} from 'node:fs';
import {mkdir,readFile,readdir,realpath,rename,unlink,writeFile} from 'node:fs/promises';
import {join,relative,isAbsolute,basename} from 'node:path';
import {fileURLToPath} from 'node:url';
import {Readable,Transform} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {setTimeout as delay} from 'node:timers/promises';
import {run} from './process.mjs';
import {candidateCheck,searchVariants} from './matching.mjs';

export function trackCsv(track) {
 const cell=value=>`"${String(value??'').replaceAll('"','""')}"`;
 if(!track.title||!track.artist||!Number.isFinite(track.duration)||track.duration<=0)throw Error('Soulseek needs a track title, artist and duration.');
 return `Title,Artist,Length\n${[track.title,track.artist,track.duration].map(cell).join(',')}\n`;
}
export function soulseekArgs(config,input,output,track,{bannedUsers=[],listen=false,quality='strict-mp3-320'}={}) {
 return ['--config',config,'--input',input,'--input-type','csv','--song','--output-dir',output,'--name-format','{slsk-filename}',
  '--format',quality==='club-aac-256'?'mp3,m4a,aac,flac,wav,aiff,alac':'mp3,flac,wav,aiff,alac','--min-bitrate',quality==='club-aac-256'?'256':'320','--pref-min-bitrate','320','--min-samplerate','44100',
  // Unknown peer metadata is accepted for discovery. Actual audio must still pass verify().
  '--strict-conditions','false','--strict-title','false','--strict-artist','false',
  '--pref-strict-title','--pref-strict-artist',
  '--desperate',
  '--length-tol',String(Math.ceil(Math.max(3,Math.min(8,track.duration*.02)))),
  '--concurrent-jobs','1','--concurrent-searches','1','--max-retries','3','--search-timeout','20000',
  '--searches-per-time','1','--searches-renew-time','12',...(listen?['--listen-port','49998']:['--no-listen']),
  '--yt-dlp','false','--no-write-index','--progress-json',...(bannedUsers.length?['--banned-users',bannedUsers.join(',')]:[])];
}
async function sha256(path){const hash=createHash('sha256');for await(const chunk of createReadStream(path))hash.update(chunk);return hash.digest('hex');}
async function audioFiles(root,directory=root){
 const result=[];for(const entry of await readdir(directory,{withFileTypes:true})){
  if(entry.isSymbolicLink())continue;const path=join(directory,entry.name);
  if(entry.isDirectory())result.push(...await audioFiles(root,path));
  else if(entry.isFile()&&/\.(mp3|flac|wav|aiff|aif|m4a|aac)$/i.test(entry.name)){
   const actual=await realpath(path),inside=relative(await realpath(root),actual);
   if(inside.startsWith('..')||isAbsolute(inside))throw Error('Soulseek output escaped its staging folder.');result.push(actual);
  }
 }return result;
}
export class Soulseek{
 constructor(dataDir,vault,downloads,options={}){Object.assign(this,{vault,downloads});this.directory=join(dataDir,'soulseek');this.account=null;this.nextSearch=0;this.retryAt=0;this.installing=null;this.runner=options.runner||run;this.clock=options.clock||(()=>Date.now());this.toolOverride=options.tool||null;this.searchInterval=options.searchInterval??12000;}
 async initialize(){await mkdir(this.directory,{recursive:true});for(const name of await readdir(this.directory))if(/^auth-[a-f0-9-]+\.conf$/.test(name))await unlink(join(this.directory,name));try{this.account=await this.vault.read();}catch{this.account=null;}}
 publicStatus(){return{configured:Boolean(this.account?.username&&this.account?.password),enabled:Boolean(this.account?.enabled),username:this.account?.username||'',allowIncoming:Boolean(this.account?.allowIncoming)};}
 get enabled(){return Boolean(this.account?.enabled&&this.account?.username&&this.account?.password);}
 async configure(value){
  const username=String(value.username||'').trim(),password=value.password||(username===this.account?.username?this.account?.password:'');
  if(!username||!password||username.length>128||password.length>256||/[\r\n\0]/.test(username+password)||password.trim()!==password)throw Error('Enter your existing Soulseek username and password without line breaks or surrounding spaces.');
  const account={username,password,enabled:value.enabled!==false,allowIncoming:value.allowIncoming===true};await this.vault.write(account);this.account=account;return this.publicStatus();
 }
 async ensureTool(signal,update=()=>{}){
  if(this.toolOverride)return this.toolOverride;
  if(process.platform!=='win32'||process.arch!=='x64')throw Error('Automatic Soulseek tool setup currently supports Windows x64.');
  const manifest=JSON.parse(await readFile(fileURLToPath(new URL('../dependencies.json',import.meta.url)),'utf8')),dependency=manifest.soulseek;
  const folder=join(this.directory,'tool',dependency.version),executable=join(folder,'sockseek.exe');
  try{if(await sha256(executable)===dependency.executableSha256)return executable;}catch(e){if(e.code!=='ENOENT')throw e;}
  if(this.installing)return this.installing;
  this.installing=(async()=>{
   await mkdir(folder,{recursive:true});const archive=join(folder,'download.zip'),partial=`${archive}.partial`;let valid=false;
   try{valid=await sha256(archive)===dependency.sha256;}catch(e){if(e.code!=='ENOENT')throw e;}
   if(!valid){update({status:'searching',message:'Preparing the verified Soulseek tool (one-time download)'});
    if(!dependency.url.startsWith('https://github.com/fiso64/sockseek/releases/download/'))throw Error('Unexpected Soulseek download source.');
    const response=await fetch(dependency.url,{signal:AbortSignal.any([signal,AbortSignal.timeout(180000)].filter(Boolean))});if(!response.ok||!response.body)throw Error('Could not download the Soulseek tool. Try again later.');
    let bytes=0;const limit=new Transform({transform(chunk,encoding,done){bytes+=chunk.length;done(bytes>80*1024*1024?Error('Soulseek archive exceeded expected size'):null,chunk);}});
    await pipeline(Readable.fromWeb(response.body),limit,createWriteStream(partial),{signal});if(await sha256(partial)!==dependency.sha256)throw Error('Soulseek tool checksum failed. Download was not executed.');await rename(partial,archive);
   }
   const extracted=`${executable}.partial`;
   const script='Add-Type -AssemblyName System.IO.Compression.FileSystem; $a=[Console]::In.ReadToEnd()|ConvertFrom-Json; $z=[IO.Compression.ZipFile]::OpenRead($a.archive); try { if($z.Entries.Count -ne 2){throw "Unexpected archive layout"}; foreach($n in @("sockseek.exe","LICENSE")){ $e=$z.GetEntry($n); if(!$e){throw "Missing archive entry"}; $p=if($n -eq "sockseek.exe"){$a.output}else{Join-Path $a.folder "LICENSE"}; [IO.Compression.ZipFileExtensions]::ExtractToFile($e,$p,$true) } } finally {$z.Dispose()}';
   await run('powershell.exe',['-NoProfile','-NonInteractive','-Command',script],{input:JSON.stringify({archive,output:extracted,folder}),signal,timeout:120000});
   if(await sha256(extracted)!==dependency.executableSha256)throw Error('Extracted Soulseek tool checksum failed.');await rename(extracted,executable);return executable;
  })();try{return await this.installing;}finally{this.installing=null;}
 }
 async acquire(track,job,update,signal){
  signal?.throwIfAborted();if(!this.enabled)throw Error('Connect Soulseek in Settings before using the fallback.');if(!/^[a-f0-9]{64}$/.test(String(job.id)))throw Error('Invalid Soulseek job identifier.');
  if(this.retryAt>this.clock())throw Object.assign(Error('Soulseek is temporarily unavailable after a connection error. Other web sources were still checked; retry this song later.'),{code:'QUALITY_REVIEW'});
  let executable;try{executable=await this.ensureTool(signal,update);}catch(e){e.code='SOULSEEK_SETUP';throw e;}
  const config=join(this.directory,`auth-${randomUUID()}.conf`),attempts=[],banned=[];
  await writeFile(config,`username = ${this.account.username}\npassword = ${this.account.password}\n`,{mode:0o600});
  try{
   const variants=searchVariants(track);
   for(let index=0;index<Math.min(5,variants.length+2);index++){
    const query={...track,...variants[Math.min(index,variants.length-1)]};
    const wait=Math.max(0,this.nextSearch-this.clock());if(wait){update({status:'searching',message:'Waiting for the next Soulseek search slot'});await delay(wait,undefined,{signal});}this.nextSearch=this.clock()+this.searchInterval;
    const folder=join(this.directory,'jobs',String(job.id),randomUUID()),output=join(folder,'audio'),input=join(folder,'track.csv');await mkdir(output,{recursive:true});await writeFile(input,trackCsv(query),{mode:0o600});
    let terminalFailure='',peer='',peerPath='',raw=0,authenticationFailed=false;
    update({status:'searching',progress:'',attempts:[...attempts],message:`Soulseek search ${index+1}: checking alternative names and peer files`});
    try{
     await this.runner(executable,soulseekArgs(config,input,output,query,{bannedUsers:banned,listen:this.account.allowIncoming,quality:this.downloads.settings?.().quality}),{signal,timeout:240000,maxBytes:4*1024*1024,onLine:line=>{
      try{const e=JSON.parse(line);if(e.type==='track_state'){if(e.data?.terminalOutcome==='Failed')terminalFailure=String(e.data.failureReason||'');raw=Math.max(raw,Number(e.data?.rawResultCount)||0);}
       if(e.type==='error'&&/invalid.{0,30}(password|credential|username)|login.{0,20}(failed|rejected)/i.test(String(e.data?.message||'')))authenticationFailed=true;
       if(e.type==='download_start'){peer=String(e.data?.username||'');peerPath=String(e.data?.filename||'');}
       const percent=Number(e.data?.percent);if(e.type==='download_progress'&&Number.isFinite(percent))update({status:'downloading',progress:`${Math.max(0,Math.min(100,percent)).toFixed(0)}%`,message:'Downloading from Soulseek; actual audio verification follows'});
      }catch{}
     }});
     signal?.throwIfAborted();const files=await audioFiles(output);if(files.length!==1)throw Error('Soulseek found no unique completed audio file.');
     const sourcePath=files[0],probe=await this.downloads.probe(sourcePath,signal),tags=probe.format?.tags||{},length=Number(probe.streams?.find(s=>s.codec_type==='audio')?.duration||probe.format?.duration||0);
     const identity=candidateCheck(track,{title:tags.title||tags.TITLE||basename(sourcePath),artist:tags.artist||tags.ARTIST||'',uploader:peerPath,duration:length});
     if(!identity.ok)throw Error(`Soulseek file needs review: ${identity.reason}`);
     const sourceReport=await this.downloads.verify(sourcePath,track,signal);attempts.push({source:'Soulseek',status:'verified',message:'Actual file passed recording, duration and audio checks'});
     return{sourcePath,sourceReport,sourceUrl:`soulseek:job/${job.id}`,attempts};
    }catch(error){
     if(signal?.aborted)throw Error('Cancelled');
     if(/Input error:|Option .{1,80} requires|Unknown (option|argument)|Unrecognized option/i.test(error.message))throw Object.assign(Error('Soulseek helper rejected its search options. Update the add-on before retrying; this is not a password error.'),{code:'SOULSEEK_SETUP'});
     if(authenticationFailed||/invalid.{0,30}(password|credential|username)|login.{0,20}(failed|rejected)|password.{0,20}(incorrect|invalid)/i.test(error.message+terminalFailure))throw Object.assign(Error('Soulseek sign-in failed. Check your account in Settings.'),{code:'SOULSEEK_AUTH'});
     const perTrack=(peer&&/timed out/.test(error.message))||(terminalFailure&&!/connection|login|auth|network/i.test(terminalFailure));
     const rejected=/^(Soulseek (found|file)|Quality check failed)/.test(error.message);
     if(!perTrack&&!rejected){this.retryAt=this.clock()+60000;throw Object.assign(Error(/timed out/.test(error.message)?'Soulseek timed out before completing the search or transfer. Other songs will continue; retry this song later.':'Soulseek connection failed. Other songs will continue; check whether another client is using this account and retry this song later.'),{code:'SOULSEEK_CONNECTION'});}
     const noResults=terminalFailure==='NoSearchResults';
     attempts.push({source:'Soulseek',status:rejected?'quality':noResults?'empty':'failed',message:rejected?error.message.slice(0,300):noResults?'No matching peer files returned for this search':'Peer transfer failed; trying an alternative',results:raw});
     update({attempts:[...attempts],message:attempts.at(-1).message});
     if(peer&&!banned.includes(peer))banned.push(peer);
     if(index>=variants.length-1&&!peer)break;
    }
   }
   const error=Error(attempts.some(a=>a.status==='quality')?'Soulseek files were found, but failed recording or audio checks. See source attempts.':'Soulseek returned no usable peer file. No result is not proof that the song is unavailable on the web. Try other sources or enable incoming peer connections in Settings.');error.code='QUALITY_REVIEW';error.attempts=attempts;throw error;
  }finally{await unlink(config).catch(e=>{if(e.code!=='ENOENT')throw e;});}
 }
}
