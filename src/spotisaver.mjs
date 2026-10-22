import {createWriteStream} from 'node:fs';
import {rename, unlink} from 'node:fs/promises';
import {join} from 'node:path';
import {Readable, Transform} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import {randomUUID} from 'node:crypto';
import {candidateCheck} from './matching.mjs';

const ORIGIN = 'https://spotisaver.online';
const MAX_AUDIO = 250 * 1024 * 1024;
const failure = message => Object.assign(Error(message), {code:'SPOTISAVER_UNAVAILABLE'});

// This service exposes a finished encoding, not its upstream recording/codec.
// Opt-in and durable provenance labelling are required even for a verified MP3.
export class Spotisaver {
  constructor({fetcher=fetch, clock=Date.now, browser=null, onChange=()=>{}}={}) {
    this.fetcher=fetcher; this.clock=clock; this.retryAt=0;this.browser=browser;this.onChange=onChange;
    this.verification={state:'closed',message:'Verify Spotisaver to connect a dedicated browser session.'};
  }
  publicStatus(){
    if(this.verification.state==='connected'&&!this.browser?.connected)return {state:'closed',connected:false,message:'The Spotisaver window is closed. Verify again to reconnect.'};
    return {...this.verification,connected:Boolean(this.browser?.connected&&this.verification.state==='connected')};
  }
  status(state,message){this.verification={state,message};this.onChange();}
  beginVerification(track) {
    if(!this.browser)throw failure('Browser verification is unavailable in this installation.');
    if(track?.provider!=='spotify'||!/^[A-Za-z0-9]{22}$/.test(track.id || ''))throw failure('Link a Spotify playlist before verifying Spotisaver.');
    if(this.rateLimited && this.retryAt>this.clock())throw failure('Spotisaver is rate limited. Try verification again later.');
    if(this.verificationTask)return this.publicStatus();
    this.verificationTrack=track;this.verificationUntil=this.clock()+300000;
    clearTimeout(this.verificationTimer);this.status('opening','Opening the Spotisaver verification window…');
    this.verificationTask=(async()=>{
      try{await this.browser.open();await this.checkVerification();}
      catch{this.status('failed','Could not connect the verification window. Check that Edge or Chrome is installed, then try again.');}
    })().finally(()=>{this.verificationTask=null;});
    return this.publicStatus();
  }
  async checkVerification() {
    clearTimeout(this.verificationTimer);
    if(!this.browser?.connected || !this.verificationTrack)throw failure('Open Verify Spotisaver first.');
    if(this.checkingVerification)return;
    if(this.rateLimited && this.retryAt>this.clock())throw failure('Spotisaver is rate limited. Try verification again later.');
    this.checkingVerification=true;
    this.status('checking','Checking the verified browser connection…');
    try{
      this.retryAt=0;
      await this.inspect(this.verificationTrack,AbortSignal.timeout(30000));
      this.status('connected','Browser connected. Retry the song to download and check its audio. Keep this window open; it can be minimized.');
    }catch(error){
      if(/browser verification/.test(error.message)){
        await this.browser.showVerification().catch(()=>{});
        this.status('needs-verification','Complete verification in the Spotisaver window. This status updates automatically; you can also click Check verification.');
        this.pollVerification();
      }else this.status('failed',error.code==='SPOTISAVER_UNAVAILABLE'?error.message:'Browser verification could not be checked. Try again.');
    }finally{this.checkingVerification=false;}
  }
  pollVerification() {
    clearTimeout(this.verificationTimer);
    if(this.clock()>=this.verificationUntil)return;
    this.verificationTimer=setTimeout(async()=>{
      if(!this.browser?.connected){this.status('closed','The Spotisaver window is closed. Verify again to reconnect.');return;}
      if(await this.browser.pageReady())await this.checkVerification().catch(()=>{});
      else this.pollVerification();
    },3000);
    this.verificationTimer.unref?.();
  }
  async closeBrowser(){clearTimeout(this.verificationTimer);this.verificationUntil=0;await this.verificationTask?.catch(()=>{});clearTimeout(this.verificationTimer);await this.browser?.close();this.status('closed','Spotisaver browser disconnected.');}
  async session(signal) {
    const cookies=new Map();
    const request=async(path, options={})=>{
      signal?.throwIfAborted();
      if(!path.startsWith('/') || path.startsWith('//'))throw failure('Invalid Spotisaver endpoint.');
      let response;
      try {
        response=await (this.browser?.connected?this.browser.fetch.bind(this.browser):this.fetcher)(ORIGIN+path, {...options, redirect:'error', signal,
          headers:{Accept:'application/json', Referer:ORIGIN+'/',
            ...(cookies.size?{Cookie:[...cookies].map(([k,v])=>`${k}=${v}`).join('; ')}:{}), ...options.headers}});
      } catch {
        signal?.throwIfAborted();
        throw failure('Spotisaver connection failed. Try again later.');
      }
      for(const cookie of response.headers.getSetCookie?.() || []) {
        const match=/^([^=;\s]+)=([^;]*)/.exec(cookie);
        if(match)cookies.set(match[1],match[2]);
      }
      if(response.status===429) {
        this.rateLimited=true;
        const retry=Number(response.headers.get('retry-after'));
        this.retryAt=this.clock()+Math.min(3600000,Math.max(60000,Number.isFinite(retry)?retry*1000:60000));
      }
      if(response.status===403 && response.headers.get('cf-mitigated')==='challenge'){
        await response.body?.cancel();
        this.status('needs-verification','Spotisaver needs browser verification. Use Verify Spotisaver, then retry.');
        throw failure('Spotisaver requires browser verification. Use Verify Spotisaver in Settings or this song’s review, then retry.');
      }
      return response;
    };
    const text=async(response,limit=2*1024*1024)=>{
      if(!response.ok){await response.body?.cancel();throw failure(`Spotisaver request failed (HTTP ${response.status}). Try again later.`);}
      if(!response.body)throw failure('Spotisaver returned an empty response.');
      const chunks=[];let size=0;
      for await(const chunk of response.body){
        signal?.throwIfAborted();size+=chunk.length;
        if(size>limit)throw failure('Spotisaver metadata exceeded its size limit.');
        chunks.push(Buffer.from(chunk));
      }
      return Buffer.concat(chunks).toString('utf8');
    };
    const json=async(response)=>{try{return JSON.parse(await text(response));}catch(error){if(error.code==='SPOTISAVER_UNAVAILABLE' || signal?.aborted)throw error;throw failure('Spotisaver returned invalid metadata.');}};
    const html=await text(await request('/',{headers:{Accept:'text/html'}}));
    if(/requiresVerification:\s*true/.test(html))throw failure('Spotisaver requires browser verification; automated fallback is unavailable.');
    let token=/requestToken:\s*"([A-Za-z0-9_-]{16,512})"/.exec(html)?.[1],wire;
    try {wire=JSON.parse(/wire:\s*(\{[^\r\n]+\})\s*\};/.exec(html)?.[1]);}catch{/* Layout changes fail closed. */}
    if(!token || !wire || !['token_param','ctx_param','action_param'].every(k=>/^[A-Za-z][A-Za-z0-9_]{0,80}$/.test(wire[k])) ||
      !['sig_header','exp_header'].every(k=>/^X-[A-Za-z0-9-]{1,80}$/i.test(wire[k])) ||
      !['get_playlist','download_track'].every(k=>/^[A-Za-z0-9_]{1,80}$/.test(wire.actions?.[k])))
      throw failure('Spotisaver changed its request format. Fallback needs an update.');
    const userIp=/const user_ip\s*=\s*"([0-9a-fA-F:.]{3,45})"/.exec(html)?.[1];
    const sign=async(action,context,refresh=true)=>{
      const params=new URLSearchParams({[wire.token_param]:token,[wire.action_param]:wire.actions[action],
        [wire.ctx_param]:Buffer.from(JSON.stringify(context)).toString('base64url')});
      const response=await request('/api/get_signature.php?'+params);
      if(response.status===403 && refresh){
        await response.body?.cancel();
        const renewed=await json(await request('/api/get_request_token.php'));
        if(!renewed.success || !/^[A-Za-z0-9_-]{16,512}$/.test(renewed.request_token))throw failure('Spotisaver session expired. Try again later.');
        token=renewed.request_token;return sign(action,context,false);
      }
      const signed=await json(response);
      if(!signed.success || typeof signed.token!=='string' || !/^[A-Za-z0-9_.:-]{1,2048}$/.test(signed.token) || !Number.isFinite(Number(signed.exp)))
        throw failure('Spotisaver request verification failed.');
      return {[wire.sig_header]:signed.token,[wire.exp_header]:String(signed.exp)};
    };
    return {request,json,sign,userIp};
  }
  async inspect(track, signal) {
    if(track.provider!=='spotify' || !/^[A-Za-z0-9]{22}$/.test(track.id || ''))throw failure('Spotisaver needs a Spotify track ID.');
    if(this.retryAt>this.clock())throw failure('Spotisaver is temporarily unavailable. Retry later.');
    this.lastTrack=track;
    const session=await this.session(signal);
    const context={id:track.id,type:'track',lang:'en'};
    const headers=await session.sign('get_playlist',context);
    const data=await session.json(await session.request('/api/get_playlist.php?'+new URLSearchParams(context),{headers}));
    const selected=data.tracks?.length===1?data.tracks[0]:null;
    const artist=Array.isArray(selected?.artists)?selected.artists.map(a=>typeof a==='string'?a:a?.name).filter(Boolean).join(', '):typeof selected?.artists==='string'?selected.artists.trim():'';
    const candidate={title:selected?.name,artist,duration:Number(selected?.duration_ms)/1000};
    if(!selected || selected.id!==track.id || !artist || !candidateCheck(track,candidate).ok || data.from_youtube || selected.from_youtube)
      throw failure('Spotisaver metadata did not match this recording, version and duration.');
    return {session,track:selected};
  }
  async acquire(track, work, downloads, update, signal) {
    const bounded=AbortSignal.any([signal,AbortSignal.timeout(240000)].filter(Boolean));
    const file=join(work,`spotisaver-${randomUUID()}.mp3`),partial=file+'.partial';
    try {
      if(this.verificationTask||this.checkingVerification)throw failure('Spotisaver verification is still running. Finish verification, then retry.');
      update({status:'searching',message:'Checking Spotisaver; original source quality is undisclosed'});
      const {session,track:selected}=await this.inspect(track,bounded);
      const headers=await session.sign('download_track',{lang:'en',id:String(selected.id),name:selected.name,duration_ms:String(Math.trunc(Number(selected.duration_ms)))});
      update({status:'downloading',progress:'',message:'Downloading from Spotisaver; 320 kbps audio check pending'});
      let response=await session.request('/api/download_track.php',{method:'POST',headers:{...headers,'Content-Type':'application/json'},
        body:JSON.stringify({track:selected,download_dir:'downloads',filename_tag:'SPOTISAVER',...(session.userIp?{user_ip:session.userIp}:{}),is_premium:false,lang:'en',direct:true})});
      if((response.headers.get('content-type') || '').includes('application/json')) {
        const result=await session.json(response);
        // Use the site's own same-origin relay. Never follow arbitrary/signed
        // CDN URLs or store them in jobs, errors, logs or settings.
        if(!result.relay || !['object','string'].includes(typeof result.relay) || Array.isArray(result.relay))throw failure('Spotisaver returned no supported audio transfer.');
        response=await session.request('/api/download_track.php',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({relay:result.relay})});
      }
      if(!response.ok || !response.body || !/^(audio\/|application\/octet-stream)/i.test(response.headers.get('content-type') || '')) {
        await response.body?.cancel();throw failure('Spotisaver did not return an audio file.');
      }
      const expected=Number(response.headers.get('content-length'));
      if(expected>MAX_AUDIO){await response.body.cancel();throw failure('Spotisaver audio exceeded the file size limit.');}
      let bytes=0;
      const limit=new Transform({transform(chunk,encoding,done){bytes+=chunk.length;done(bytes>MAX_AUDIO?failure('Spotisaver audio exceeded the file size limit.'):null,chunk);}});
      await pipeline(Readable.fromWeb(response.body),limit,createWriteStream(partial,{flags:'wx'}),{signal:bounded});
      if(!bytes || (expected>0 && bytes!==expected))throw failure('Spotisaver transfer was incomplete.');
      update({status:'validating',message:'Checking actual Spotisaver MP3 bitrate, recording and full decoding'});
      const probe=await downloads.probe(partial,bounded),tags=probe.format?.tags || {};
      const identity=candidateCheck(track,{title:tags.title || tags.TITLE || '',artist:tags.artist || tags.ARTIST || '',duration:Number(probe.format?.duration)});
      if(!identity.ok)throw failure('Spotisaver file tags or duration did not match this recording.');
      const report=await downloads.verify(partial,track,bounded);
      if(!report.ok || report.codec!=='mp3' || report.bitrate!==320)throw failure('Spotisaver file is not verified 320 kbps MP3. No quality exception was applied.');
      bounded.throwIfAborted();await rename(partial,file);
      return {sourcePath:file,sourceUrl:`${ORIGIN}/en/track/${track.id}`,
        sourceReport:{...report,sourceService:'spotisaver',upstreamQuality:'unverified'}};
    } catch(error) {
      await unlink(partial).catch(()=>{});
      signal?.throwIfAborted();
      this.retryAt=Math.max(this.retryAt,this.clock()+60000);
      if(error.code==='SPOTISAVER_UNAVAILABLE')throw error;
      if(bounded.aborted)throw failure('Spotisaver timed out. Try again later.');
      // ffprobe/network errors may include local paths or signed response URLs.
      throw failure('Spotisaver file failed transfer, recording or audio validation.');
    }
  }
}
