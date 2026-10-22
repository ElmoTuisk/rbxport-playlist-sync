import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,readdir,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {Spotisaver} from '../src/spotisaver.mjs';

const track={provider:'spotify',id:'a'.repeat(22),title:'Fixture Song',artist:'Fixture Artist',duration:200};
const selected={id:track.id,name:track.title,artists:[{name:track.artist}],duration_ms:200000};
const wire={token_param:'request_key',ctx_param:'context',action_param:'action',sig_header:'X-Signature',exp_header:'X-Expiry',actions:{get_playlist:'metadata',download_track:'download'}};
const html=`const user_ip = "127.0.0.1"; const turnstileConfig={requiresVerification:false};\nconst playlistRequestSignature={requestToken:"${'t'.repeat(32)}",wire:${JSON.stringify(wire)}};`;
const json=value=>new Response(JSON.stringify(value),{headers:{'content-type':'application/json'}});
function service({relay=false,audio='fixture audio',metadata=selected,fail,signatureExpired=false}={}) {
  const calls=[];let signatures=0;
  const provider=new Spotisaver({fetcher:async(raw,options)=>{
    const url=new URL(raw);calls.push({path:url.pathname,options});
    assert.equal(url.origin,'https://spotisaver.online');assert.equal(options.redirect,'error');
    if(fail){const response=fail(url,options);if(response)return response;}
    if(url.pathname==='/')return new Response(html,{headers:{'set-cookie':'PHPSESSID=fixture-session; Path=/; HttpOnly'}});
    assert.match(options.headers.Cookie,/PHPSESSID=fixture-session/);
    if(url.pathname==='/api/get_request_token.php')return json({success:true,request_token:'r'.repeat(32)});
    if(url.pathname==='/api/get_signature.php'){
      if(signatureExpired && signatures++===0)return new Response('',{status:403});
      const context=JSON.parse(Buffer.from(url.searchParams.get('context'),'base64url'));
      assert.equal(context.id,track.id);assert.equal(context.lang,'en');
      return json({success:true,token:'fixture-signature',exp:123456789});
    }
    if(url.pathname==='/api/get_playlist.php'){
      assert.equal(options.headers['X-Signature'],'fixture-signature');
      return json({tracks:[metadata]});
    }
    if(url.pathname==='/api/download_track.php'){
      const body=JSON.parse(options.body);
      if(body.relay){assert.deepEqual(body.relay,{ticket:'fixture-relay'});return new Response(audio,{headers:{'content-type':'audio/mpeg'}});}
      assert.equal(options.headers['X-Signature'],'fixture-signature');assert.equal(body.is_premium,false);assert.equal(body.track.id,track.id);
      return relay?json({download_url:'https://127.0.0.1/private',relay:{ticket:'fixture-relay'}}):new Response(audio,{headers:{'content-type':'audio/mpeg'}});
    }
    throw Error('Unexpected request');
  }});
  return {provider,calls};
}
async function fixture(t){const dir=await mkdtemp(join(tmpdir(),'playlist-spotisaver-'));t.after(()=>rm(dir,{recursive:true,force:true}));return dir;}
function verifier(overrides={}){return {
  probe:async()=>({format:{duration:200,tags:{title:track.title,artist:track.artist}}}),
  verify:async()=>({ok:true,codec:'mp3',bitrate:320,duration:200,sampleRate:44100,channels:2}),...overrides};}

test('Spotisaver signs metadata without downloading and keeps the session private',async()=>{
  const {provider,calls}=service({signatureExpired:true});
  const result=await provider.inspect(track,AbortSignal.timeout(5000));
  assert.equal(result.track.id,track.id);
  assert.equal(calls.filter(c=>c.path==='/api/get_request_token.php').length,1);
  assert(!calls.some(c=>c.path==='/api/download_track.php'));
  await assert.rejects(provider.inspect({...track,provider:'soundcloud'}),/Spotify track ID/);
  const scalar=service({metadata:{...selected,artists:track.artist}});
  assert.equal((await scalar.provider.inspect(track)).track.id,track.id);
});
test('Spotisaver accepts binary and same-origin relay transfers only after file verification',async t=>{
  const dir=await fixture(t);
  for(const relay of [false,true]){
    const {provider}=service({relay}),updates=[];
    const result=await provider.acquire(track,dir,verifier(),v=>updates.push(v),new AbortController().signal);
    assert.equal(await readFile(result.sourcePath,'utf8'),'fixture audio');
    assert.equal(result.sourceReport.bitrate,320);assert.equal(result.sourceReport.upstreamQuality,'unverified');
    assert.match(result.sourceUrl,/\/en\/track\/[a-z]+$/);
    assert(!JSON.stringify(result).includes('fixture-signature'));assert(!JSON.stringify(result).includes('fixture-session'));
    assert(updates.some(v=>v.status==='validating'));
  }
});
test('Spotisaver rejects fake bitrate, wrong codecs, wrong recording tags and decode failures',async t=>{
  const dir=await fixture(t);
  for(const overrides of [
    {verify:async()=>({ok:true,codec:'mp3',bitrate:128})},
    {verify:async()=>({ok:true,codec:'aac',bitrate:320})},
    {verify:async()=>({ok:true,codec:'mp3',bitrate:0})},
    {verify:async()=>{throw Error('Quality check failed: truncated/private-file-path');}},
    {probe:async()=>({format:{duration:200,tags:{title:'Wrong Recording',artist:track.artist}}})},
    {probe:async()=>({format:{duration:30,tags:{title:track.title,artist:track.artist}}})},
  ]){
    const {provider}=service();
    await assert.rejects(provider.acquire(track,dir,verifier(overrides),()=>{},new AbortController().signal),e=>e.code==='SPOTISAVER_UNAVAILABLE'&&!e.message.includes('private-file-path'));
    assert.deepEqual(await readdir(dir),[]);
  }
});
test('Spotisaver rejects metadata mismatches before requesting audio',async()=>{
  for(const metadata of [{...selected,id:'b'.repeat(22)},{...selected,name:'Fixture Song Remix'},{...selected,duration_ms:30000},{...selected,artists:[]}]){
    const {provider,calls}=service({metadata});
    await assert.rejects(provider.inspect(track),/did not match/);
    assert(!calls.some(c=>c.path==='/api/download_track.php'));
  }
});
test('Spotisaver handles challenges, changed contracts and rate limits without bypass or repeated requests',async t=>{
  const dir=await fixture(t);
  for(const response of [()=>new Response('challenge',{status:403,headers:{'cf-mitigated':'challenge'}}),()=>new Response('slow down',{status:429,headers:{'retry-after':'120'}}),()=>new Response('changed page')]){
    const {provider,calls}=service({fail:url=>url.pathname==='/'?response():null});
    await assert.rejects(provider.acquire(track,dir,verifier(),()=>{},new AbortController().signal));
    const count=calls.length;await assert.rejects(provider.inspect(track),/temporarily unavailable/);assert.equal(calls.length,count);
    assert.deepEqual(await readdir(dir),[]);
  }
});
test('Spotisaver rejects oversized files, HTML, missing relay and interrupted transfers',async t=>{
  const dir=await fixture(t);
  for(const response of [
    ()=>new Response('audio',{headers:{'content-type':'audio/mpeg','content-length':String(251*1024*1024)}}),
    ()=>new Response('<html>not audio</html>',{headers:{'content-type':'text/html'}}),
    ()=>json({download_url:'https://127.0.0.1/private'}),
    ()=>new Response('short',{headers:{'content-type':'audio/mpeg','content-length':'100'}}),
    ()=>new Response(new ReadableStream({start(c){c.enqueue(new Uint8Array([1,2,3]));c.error(Error('broken transfer'));}}),{headers:{'content-type':'audio/mpeg'}}),
  ]){
    const {provider}=service({fail:url=>url.pathname==='/api/download_track.php'?response():null});
    await assert.rejects(provider.acquire(track,dir,verifier(),()=>{},new AbortController().signal));
    assert.deepEqual(await readdir(dir),[]);
  }
  const {provider,calls}=service(),abort=new AbortController();abort.abort();
  await assert.rejects(provider.acquire(track,dir,verifier(),()=>{},abort.signal));assert.equal(calls.length,0);
});
