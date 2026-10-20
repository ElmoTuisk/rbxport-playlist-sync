import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Soulseek, trackCsv, soulseekArgs } from '../src/soulseek.mjs';

const track = {title:'Fixture Track',artist:'Fixture Artist',duration:200};
const job = {id:'a'.repeat(64)};
async function fixture(t, {runnerError = false, wrongIdentity = false, wrongQuality = false, notFound = false} = {}) {
  const dir = await mkdtemp(join(tmpdir(),'playlist-soulseek-'));
  t.after(() => rm(dir,{recursive:true,force:true}));
  const vault = {value:null,async read(){return this.value;},async write(value){this.value=value;}};
  const downloads = {async probe(){return {format:{duration:'200',tags:{title:wrongIdentity ? 'A Different Song' : track.title,artist:track.artist}}};},async verify(){if(wrongQuality)throw Error('Quality check failed: 128 kbps');return {codec:'mp3',bitrate:320};}};
  let credentialsPassed = false;
  const runner = async (executable,args,options) => {
    assert(!args.some(arg=>String(arg).includes('fixture-private-password')));
    const config = args[args.indexOf('--config')+1];
    credentialsPassed = (await readFile(config,'utf8')).includes('password = fixture-private-password');
    if(notFound){options.onLine(JSON.stringify({type:'track_state',data:{terminalOutcome:'Failed',failureReason:'NoSearchResults'}}));throw Error('Tool exited 1');}
    if(runnerError)throw Error('fixture-private-password must never appear in a public error');
    const output = args[args.indexOf('--output-dir')+1];
    await writeFile(join(output,wrongIdentity ? 'Other Artist - Another Song.mp3' : 'Fixture Artist - Fixture Track.mp3'),'fixture');
  };
  const soulseek = new Soulseek(dir,vault,downloads,{runner,tool:'fixture-sockseek',searchInterval:0});
  await soulseek.initialize();
  await soulseek.configure({username:'fixture-user',password:'fixture-private-password',enabled:true});
  return {soulseek,vault,dir,credentialsPassed:()=>credentialsPassed};
}

test('Soulseek CSV preserves punctuation and quotes as one track; command enforces quality without password arguments', () => {
  assert.match(trackCsv({...track,title:'A, "quoted" song'}), /"A, ""quoted"" song"/);
  const args = soulseekArgs('private.conf','one.csv','stage',track);
  for(const flag of ['--strict-title','--strict-artist','--strict-conditions'])assert.equal(args[args.indexOf(flag)+1],'false');
  assert(args.includes('--no-listen'));
  assert.equal(args[args.indexOf('--min-bitrate')+1],'320');
  assert.equal(args[args.indexOf('--yt-dlp')+1],'false');
  const fractional = soulseekArgs('private.conf','one.csv','stage',{...track,duration:323.49});
  assert.equal(fractional[fractional.indexOf('--length-tol')+1],'7');
  assert(!args.includes('--pass'));
  assert.throws(()=>trackCsv({...track,duration:0}));
});

test('Soulseek settings expose no password and reject config-line injection', async t => {
  const f = await fixture(t);
  assert.deepEqual(f.soulseek.publicStatus(),{configured:true,enabled:true,username:'fixture-user',allowIncoming:false});
  await assert.rejects(f.soulseek.configure({username:'user',password:'secret\non-complete = malicious'}));
  await f.soulseek.configure({username:'fixture-user',password:'',enabled:false});
  assert.equal(f.soulseek.enabled,false);
  assert.equal(f.vault.value.password,'fixture-private-password');
});

test('Soulseek acquisition checks identity and audio and removes its transient credential file', async t => {
  const f = await fixture(t), result = await f.soulseek.acquire(track,job,()=>{},new AbortController().signal);
  assert.match(result.sourcePath,/\.mp3$/);
  assert.equal(result.sourceReport.bitrate,320);
  assert(f.credentialsPassed());
  assert(!(await readdir(join(f.dir,'soulseek'))).some(n=>n.startsWith('auth-')));
});

test('Soulseek does not accept a wrong recording or lower-quality file', async t => {
  for(const options of [{wrongIdentity:true},{wrongQuality:true}]){
    const f = await fixture(t,options);
    await assert.rejects(f.soulseek.acquire(track,job,()=>{},new AbortController().signal),error=>error.code==='QUALITY_REVIEW'&&error.attempts.some(a=>a.status==='quality'));
    assert(!(await readdir(join(f.dir,'soulseek'))).some(n=>n.startsWith('auth-')));
  }
});

test('Soulseek failures redact tool output, clean credentials and reject cancelled work', async t => {
  const f = await fixture(t,{runnerError:true});
  await assert.rejects(f.soulseek.acquire(track,job,()=>{},new AbortController().signal),error=>error.code==='SOULSEEK_CONNECTION'&&!error.message.includes('fixture-private-password'));
  assert(!(await readdir(join(f.dir,'soulseek'))).some(n=>n.startsWith('auth-')));
  const controller = new AbortController();controller.abort();
  await assert.rejects(f.soulseek.acquire(track,job,()=>{},controller.signal));
});

test('a normal no-result exit remains a per-track review so the batch can continue', async t => {
  const f = await fixture(t,{notFound:true});
  await assert.rejects(f.soulseek.acquire(track,job,()=>{},new AbortController().signal),error=>error.code==='QUALITY_REVIEW'&&error.attempts[0].status==='empty');
});

test('temporary connection failures back off without repeated helper launches, then allow a later retry',async t=>{
 const f=await fixture(t);let now=0,calls=0;f.soulseek.clock=()=>now;
 f.soulseek.runner=async()=>{calls++;throw Error('Tool timed out');};
 await assert.rejects(f.soulseek.acquire(track,job,()=>{}),e=>e.code==='SOULSEEK_CONNECTION');assert.equal(calls,1);
 await assert.rejects(f.soulseek.acquire(track,job,()=>{}),e=>e.code==='QUALITY_REVIEW'&&/temporarily unavailable/.test(e.message));assert.equal(calls,1);
 now=61000;await assert.rejects(f.soulseek.acquire(track,job,()=>{}),e=>e.code==='SOULSEEK_CONNECTION');assert.equal(calls,2);
});

test('helper option errors are setup failures rather than misleading account errors', async t => {
  const f = await fixture(t);
  f.soulseek.runner = async () => { throw Error("Tool exited 2: [error] [cli] Input error: Option '--length-tol' requires an integer parameter, got '6.4698'"); };
  await assert.rejects(f.soulseek.acquire(track,job,()=>{},new AbortController().signal),error=>error.code==='SOULSEEK_SETUP'&&/not a password error/.test(error.message));
  assert(!(await readdir(join(f.dir,'soulseek'))).some(n=>n.startsWith('auth-')));
});

test('Soulseek cleans collaboration queries and checks the result against the original recording',async t=>{
 const f=await fixture(t);let calls=0;
 f.soulseek.runner=async(exe,args,options)=>{
  calls++;const csv=await readFile(args[args.indexOf('--input')+1],'utf8');
  if(calls===1){assert(csv.includes('Fixture Artist, Collaborator'));options.onLine(JSON.stringify({type:'track_state',data:{terminalOutcome:'Failed',failureReason:'NoSearchResults'}}));throw Error('Tool exited 1');}
  assert(csv.includes('"Fixture Artist"'));await writeFile(join(args[args.indexOf('--output-dir')+1],'Fixture Artist - Fixture Track.mp3'),'fixture');
 };
 const result=await f.soulseek.acquire({...track,artist:'Fixture Artist, Collaborator'},job,()=>{},new AbortController().signal);
 assert.equal(calls,2);assert.equal(result.sourceReport.bitrate,320);
});
test('a rejected peer file is followed by a different peer, without importing the first',async t=>{
 const f=await fixture(t);let calls=0;
 f.soulseek.runner=async(exe,args,options)=>{
  calls++;if(calls===2){assert.equal(args[args.indexOf('--banned-users')+1],'bad-peer');}
  options.onLine(JSON.stringify({type:'download_start',data:{username:calls===1?'bad-peer':'good-peer',filename:'Fixture Artist/Fixture Track.mp3'}}));
  await writeFile(join(args[args.indexOf('--output-dir')+1],'Fixture Artist - Fixture Track.mp3'),calls===1?'128':'320');
 };
 f.soulseek.downloads.verify=async path=>{if((await readFile(path,'utf8'))==='128')throw Error('Quality check failed: 128 kbps');return{ok:true,codec:'mp3',bitrate:320};};
 const result=await f.soulseek.acquire(track,job,()=>{},new AbortController().signal);
 assert.equal(calls,2);assert.equal(await readFile(result.sourcePath,'utf8'),'320');
 assert(!JSON.stringify(result.attempts).includes('bad-peer'));
});
test('incoming connections are explicit and are not enabled by an unrelated account save',async t=>{
 const f=await fixture(t);assert.equal(f.soulseek.publicStatus().allowIncoming,false);
 await f.soulseek.configure({username:'fixture-user',password:'',enabled:true,allowIncoming:true});assert.equal(f.soulseek.publicStatus().allowIncoming,true);
 const args=soulseekArgs('c','i','o',track,{listen:true});assert(args.includes('--listen-port'));assert(!args.includes('--no-listen'));
});

test('a stalled individual peer is retried rather than stopping the whole batch',async t=>{
 const f=await fixture(t);let calls=0;
 f.soulseek.runner=async(exe,args,options)=>{calls++;if(calls===1){options.onLine(JSON.stringify({type:'download_start',data:{username:'stalled-peer',filename:'Fixture Artist/Fixture Track.mp3'}}));throw Error('Tool timed out');}assert.equal(args[args.indexOf('--banned-users')+1],'stalled-peer');await writeFile(join(args[args.indexOf('--output-dir')+1],'Fixture Artist - Fixture Track.mp3'),'fixture');};
 const result=await f.soulseek.acquire(track,job,()=>{},new AbortController().signal);assert.equal(calls,2);assert.equal(result.sourceReport.bitrate,320);
});
