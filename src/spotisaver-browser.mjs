import {spawn} from 'node:child_process';
import {access, mkdir, readFile, unlink} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';

const ORIGIN='https://spotisaver.online';
const paths=new Set(['/','/api/get_signature.php','/api/get_request_token.php','/api/get_playlist.php','/api/download_track.php']);
const problem=()=>Error('The Spotisaver browser connection was interrupted. Open Verify Spotisaver again.');

export function browserArguments(profile) {
  return [`--user-data-dir=${profile}`,'--remote-debugging-port=0','--remote-debugging-address=127.0.0.1',
    '--no-first-run','--no-default-browser-check',`--app=${ORIGIN}/`];
}

export async function findBrowser(env=process.env) {
  if(process.platform!=='win32')throw Error('Spotisaver browser verification currently requires Windows with Edge or Chrome.');
  for(const [base,relative] of [
    [env['ProgramFiles(x86)'],'Microsoft/Edge/Application/msedge.exe'],[env.ProgramFiles,'Microsoft/Edge/Application/msedge.exe'],
    [env.LOCALAPPDATA,'Microsoft/Edge/Application/msedge.exe'],[env.ProgramFiles,'Google/Chrome/Application/chrome.exe'],
    [env['ProgramFiles(x86)'],'Google/Chrome/Application/chrome.exe'],[env.LOCALAPPDATA,'Google/Chrome/Application/chrome.exe'],
  ])if(base){const path=join(base,relative);try{await access(path);return path;}catch{}}
  throw Error('Install Microsoft Edge or Google Chrome to verify Spotisaver.');
}

// Runs only in the dedicated Spotisaver tab. Cookies never leave the browser.
// Audio crosses the local connection in bounded chunks, not a large base64 blob.
export async function browserOperation(input) {
  if(location.origin!=='https://spotisaver.online')throw Error('Wrong page');
  if(input.op==='page')return {ready:document.readyState==='complete' &&
    (document.contentType==='application/json' || (/requestToken:\s*"[A-Za-z0-9_-]+"/.test(document.documentElement.innerHTML) && !/requiresVerification:\s*true/.test(document.documentElement.innerHTML)))};
  const transfers=globalThis.__playlistSyncSpotisaverTransfers ||= new Map();
  if(input.op==='start'){
    const url=new URL(input.url);
    if(url.origin!==location.origin || !['/','/api/get_signature.php','/api/get_request_token.php','/api/get_playlist.php','/api/download_track.php'].includes(url.pathname))throw Error('Wrong endpoint');
    const controller=new AbortController(),entry={controller};transfers.set(input.id,entry);
    entry.timer=setTimeout(()=>{controller.abort();transfers.delete(input.id);},240000);
    try{
      const response=await fetch(input.url,{method:input.method,headers:input.headers,body:input.body,redirect:'error',credentials:'include',cache:'no-store',signal:controller.signal});
      entry.reader=response.body?.getReader();entry.bytes=0;
      return {status:response.status,headers:['content-type','content-length','retry-after','cf-mitigated'].flatMap(key=>response.headers.has(key)?[[key,response.headers.get(key)]]:[])};
    }catch{clearTimeout(entry.timer);transfers.delete(input.id);throw Error('Request failed');}
  }
  const entry=transfers.get(input.id);
  if(!entry){if(input.op==='cancel')return;throw Error('Transfer expired');}
  if(input.op==='cancel'){
    clearTimeout(entry.timer);entry.controller.abort();void entry.reader?.cancel().catch(()=>{});transfers.delete(input.id);return;
  }
  if(input.op!=='read')throw Error('Unknown operation');
  if(!entry.rest?.length){
    const next=await entry.reader?.read();
    if(!next || next.done){clearTimeout(entry.timer);transfers.delete(input.id);return {done:true};}
    entry.rest=next.value;
  }
  const chunk=entry.rest.subarray(0,32768);entry.rest=entry.rest.subarray(chunk.length);
  entry.bytes+=chunk.length;
  if(entry.bytes>250*1024*1024){clearTimeout(entry.timer);entry.controller.abort();transfers.delete(input.id);throw Error('Too large');}
  return {done:false,data:btoa(String.fromCharCode(...chunk))};
}

export class SpotisaverBrowser {
  constructor(dataDir,{locate=findBrowser,launch=spawn,fetcher=fetch,Socket=WebSocket,onChange=()=>{}}={}) {
    this.profile=resolve(dataDir,'spotisaver-browser');this.locate=locate;this.launch=launch;this.fetcher=fetcher;this.Socket=Socket;this.onChange=onChange;
    this.pending=new Map();this.contexts=new Map();this.sequence=0;
  }
  get connected(){return this.socket?.readyState===1;}
  async open() {
    if(this.connected){await this.request('Page.bringToFront');return;}
    if(this.opening)return this.opening;
    this.opening=this.start().finally(()=>{this.opening=null;});return this.opening;
  }
  async start() {
    const executable=await this.locate();
    await mkdir(this.profile,{recursive:true,mode:0o700});
    // Never attach to a personal browser or an old debugging endpoint.
    await unlink(join(this.profile,'DevToolsActivePort')).catch(error=>{if(error.code!=='ENOENT')throw error;});
    const child=this.launch(executable,browserArguments(this.profile),{stdio:'ignore',shell:false,windowsHide:false});
    this.child=child;let launchError=false;child.on('error',()=>{launchError=true;});
    const deadline=Date.now()+15000;
    try{
      while(Date.now()<deadline){
        if(launchError)throw problem();
        try{
          const [rawPort]=String(await readFile(join(this.profile,'DevToolsActivePort'),'utf8')).split(/\r?\n/);
          const port=Number(rawPort);if(!Number.isInteger(port)||port<1||port>65535)throw problem();
          const response=await this.fetcher(`http://127.0.0.1:${port}/json/list`,{redirect:'error',signal:AbortSignal.timeout(1500)});
          if(!response.ok)throw problem();
          const tabs=await response.json(),tab=tabs.find(t=>t.type==='page'&&t.url?.startsWith(ORIGIN+'/'));
          const address=new URL(tab?.webSocketDebuggerUrl);
          if(address.protocol!=='ws:'||address.hostname!=='127.0.0.1'||Number(address.port)!==port||!/^\/devtools\/page\/[A-Za-z0-9-]+$/.test(address.pathname))throw problem();
          await this.connect(address.href);
          await this.request('Page.enable');await this.request('Runtime.enable');
          const {frameTree}=await this.request('Page.getFrameTree');this.frame=frameTree.frame.id;
          // The integration transfers audio through its validator. Browser clicks
          // must not silently save an unchecked file to the user's Downloads.
          await this.request('Browser.setDownloadBehavior',{behavior:'deny'});
          const readyUntil=Date.now()+5000;
          while(!this.hasContext()&&Date.now()<readyUntil)await delay(100);
          if(!this.hasContext())throw problem();
          this.onChange();return;
        }catch{if(this.connected)throw problem();}
        await delay(200);
      }
      throw Error('Could not open the Spotisaver verification window. Close its old window and try again.');
    }catch(error){await this.close();throw error;}
  }
  async connect(address) {
    const socket=new this.Socket(address);this.socket=socket;
    socket.addEventListener('message',event=>{
      let message;try{message=JSON.parse(event.data);}catch{return;}
      if(message.method==='Runtime.executionContextCreated')this.contexts.set(message.params.context.id,message.params.context);
      if(message.method==='Runtime.executionContextDestroyed')this.contexts.delete(message.params.executionContextId);
      if(message.method==='Runtime.executionContextsCleared')this.contexts.clear();
      const pending=this.pending.get(message.id);if(!pending)return;
      this.pending.delete(message.id);pending.finish(message.error?problem():null,message.result);
    });
    socket.addEventListener('close',()=>{for(const pending of this.pending.values())pending.finish(problem());this.pending.clear();this.contexts.clear();this.onChange();});
    await new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{socket.close();reject(problem());},3000);
      socket.addEventListener('open',()=>{clearTimeout(timer);resolve();},{once:true});
      socket.addEventListener('error',()=>{clearTimeout(timer);reject(problem());},{once:true});
    });
  }
  request(method,params={},signal,timeout=120000) {
    if(!this.connected)return Promise.reject(problem());
    signal?.throwIfAborted();const id=++this.sequence;
    return new Promise((resolve,reject)=>{
      const finish=(error,result)=>{clearTimeout(timer);signal?.removeEventListener('abort',abort);error?reject(error):resolve(result);};
      const abort=()=>{this.pending.delete(id);finish(problem());};
      const timer=setTimeout(abort,timeout);signal?.addEventListener('abort',abort,{once:true});
      this.pending.set(id,{finish});this.socket.send(JSON.stringify({id,method,params}));
    });
  }
  async operation(input,signal) {
    const context=[...this.contexts.values()].find(c=>c.origin===ORIGIN&&c.auxData?.isDefault&&c.auxData?.frameId===this.frame);
    if(!context)throw problem();
    const result=await this.request('Runtime.evaluate',{expression:`(${browserOperation.toString()})(${JSON.stringify(input)})`,contextId:context.id,awaitPromise:true,returnByValue:true},signal);
    if(result.exceptionDetails)throw problem();return result.result?.value;
  }
  hasContext(){return [...this.contexts.values()].some(c=>c.origin===ORIGIN&&c.auxData?.isDefault&&c.auxData?.frameId===this.frame);}
  async pageReady(){try{return (await this.operation({op:'page'}))?.ready===true;}catch{return false;}}
  async showVerification() {
    await this.request('Page.bringToFront');
    await this.request('Page.navigate',{url:this.challengeUrl || ORIGIN+'/'});
  }
  async fetch(url,options={}) {
    const target=new URL(url);
    if(target.origin!==ORIGIN||!paths.has(target.pathname)||target.username||target.password)throw problem();
    const method=options.method || 'GET';if(!['GET','POST'].includes(method))throw problem();
    const headers=Object.fromEntries([...new Headers(options.headers)].filter(([key])=>['accept','content-type'].includes(key)||/^x-[a-z0-9-]+$/.test(key)));
    const id=randomUUID(),signal=options.signal;
    const cancel=()=>{void this.operation({op:'cancel',id}).catch(()=>{});};
    signal?.throwIfAborted();signal?.addEventListener('abort',cancel,{once:true});
    const done=()=>signal?.removeEventListener('abort',cancel);
    try{
      const info=await this.operation({op:'start',id,url:target.href,method,headers,body:options.body},signal);
      const responseHeaders=new Headers(info.headers);
      if(info.status===403&&responseHeaders.get('cf-mitigated')==='challenge'){
        // Navigate only to a public, unsigned GET page when the user asks to verify.
        const trackId=target.searchParams.get('id');
        this.challengeUrl=target.pathname==='/api/get_playlist.php'&&/^[A-Za-z0-9]{22}$/.test(trackId || '')?
          `${ORIGIN}/api/get_playlist.php?${new URLSearchParams({id:trackId,type:'track',lang:'en'})}`:ORIGIN+'/';
      }
      if([204,205,304].includes(info.status)){done();cancel();return new Response(null,{status:info.status,headers:responseHeaders});}
      const browser=this;
      const body=new ReadableStream({
        async pull(controller){try{const next=await browser.operation({op:'read',id},signal);if(next.done){done();controller.close();}else{
          if(typeof next.data!=='string'||next.data.length>44000)throw problem();controller.enqueue(Buffer.from(next.data,'base64'));
        }}catch{done();cancel();controller.error(problem());}},
        cancel(){done();cancel();},
      },{highWaterMark:0});
      return new Response(body,{status:info.status,headers:responseHeaders});
    }catch{done();cancel();signal?.throwIfAborted();throw problem();}
  }
  async close() {
    if(this.connected)await this.request('Browser.close',{},undefined,2000).catch(()=>{});
    this.socket?.close();this.socket=null;this.contexts.clear();
    this.child?.kill();this.child=null;this.onChange();
  }
}
