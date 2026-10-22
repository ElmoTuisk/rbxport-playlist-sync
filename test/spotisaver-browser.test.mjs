import test from 'node:test';
import assert from 'node:assert/strict';
import {runInNewContext} from 'node:vm';
import {browserArguments,browserOperation,SpotisaverBrowser} from '../src/spotisaver-browser.mjs';
import {Spotisaver} from '../src/spotisaver.mjs';

const origin='https://spotisaver.online';
const track={provider:'spotify',id:'a'.repeat(22),title:'Fixture Song',artist:'Fixture Artist',duration:200};
function page(fetcher,{originValue=origin,contentType='text/html',html='requestToken: "test"'}={}) {
  const context={fetch:fetcher,location:{origin:originValue},document:{readyState:'complete',contentType,documentElement:{innerHTML:html}},URL,AbortController,setTimeout,clearTimeout,btoa};
  const operation=runInNewContext(`(${browserOperation.toString()})`,context);
  const browser=new SpotisaverBrowser('/fixture');browser.operation=operation;
  return {browser,context,operation};
}

test('dedicated browser uses a separate profile, loopback debugging and no challenge-solving flags',()=>{
  const args=browserArguments('C:\\fixture profile');
  assert(args.includes('--user-data-dir=C:\\fixture profile'));
  assert(args.includes('--remote-debugging-port=0'));assert(args.includes('--remote-debugging-address=127.0.0.1'));
  assert(args.includes('--app=https://spotisaver.online/'));
  assert(!args.some(arg=>/headless|disable-web-security|ignore-certificate|automation|stealth/.test(arg)));
});

test('browser transport streams bounded audio chunks and keeps cookies in the browser',async()=>{
  const bytes=Buffer.alloc(300000);for(let i=0;i<bytes.length;i++)bytes[i]=i%251;
  let observed;
  const {browser,context}=page(async(url,options)=>{
    observed=options;
    return new Response(bytes,{headers:{'content-type':'audio/mpeg','set-cookie':'secret=never-export','content-length':String(bytes.length)}});
  });
  const response=await browser.fetch(origin+'/api/download_track.php',{method:'POST',headers:{Cookie:'do-not-copy',Referer:'private',Accept:'audio/*','X-Signature':'memory-only'},body:'{}'});
  assert.equal(observed.credentials,'include');assert.equal(observed.redirect,'error');assert.equal(observed.headers.cookie,undefined);assert.equal(observed.headers.referer,undefined);
  assert.equal(observed.headers['x-signature'],'memory-only');assert.equal(response.headers.get('set-cookie'),null);
  const chunks=[];for await(const chunk of response.body){assert(chunk.length<=32768);chunks.push(Buffer.from(chunk));}
  assert.deepEqual(Buffer.concat(chunks),bytes);assert.equal(context.__playlistSyncSpotisaverTransfers.size,0);
});

test('browser transport refuses foreign endpoints, origins and redirects and cleans cancelled streams',async()=>{
  let calls=0;const {browser,context}=page(async()=>{calls++;return new Response('body');});
  for(const url of ['https://elsewhere.test/','https://spotisaver.online.evil.test/','https://spotisaver.online@127.0.0.1/','https://spotisaver.online/admin'])await assert.rejects(browser.fetch(url));
  assert.equal(calls,0);
  await assert.rejects(browser.fetch(origin+'/',{method:'DELETE'}));
  const wrong=page(()=>{throw Error('must not fetch');},{originValue:'https://unrelated.test'});
  await assert.rejects(wrong.browser.fetch(origin+'/'));
  const response=await browser.fetch(origin+'/');await response.body.cancel();
  await Promise.resolve();assert.equal(context.__playlistSyncSpotisaverTransfers.size,0);
  const broken=page(async()=>{throw Error('signed private URL');});
  await assert.rejects(broken.browser.fetch(origin+'/'),error=>!error.message.includes('private URL'));
  const abort=new AbortController();abort.abort();await assert.rejects(browser.fetch(origin+'/',{signal:abort.signal}));assert.equal(calls,1);
});

test('challenge navigation retains only public track parameters and cannot claim a cleared challenge is verified audio',async()=>{
  const {browser}=page(async()=>new Response('challenge',{status:403,headers:{'cf-mitigated':'challenge'}}),{html:'Just a moment…'});
  const response=await browser.fetch(origin+`/api/get_playlist.php?id=${track.id}&type=track&lang=en&secret=private`);
  await response.body.cancel();assert.equal(browser.challengeUrl,origin+`/api/get_playlist.php?id=${track.id}&type=track&lang=en`);
  assert.equal(await browser.pageReady(),false);
  const ready=page(()=>{}, {contentType:'application/json',html:'{}'});assert.equal(await ready.browser.pageReady(),true);
  const foreign=page(()=>{}, {originValue:'https://unrelated.test'});assert.equal(await foreign.browser.pageReady(),false);
});

test('verification waits for the user, validates metadata, respects rate limits and never starts audio',async t=>{
  let challenge=true,opens=0,shown=0,requests=[];
  const wire={token_param:'token',ctx_param:'ctx',action_param:'action',sig_header:'X-Signature',exp_header:'X-Expiry',actions:{get_playlist:'metadata',download_track:'download'}};
  const browser={connected:false,async open(){opens++;this.connected=true;},async close(){this.connected=false;},async showVerification(){shown++;},pageReady:async()=>false,
    async fetch(raw){const url=new URL(raw);requests.push(url.pathname);
      if(url.pathname==='/')return new Response(`requestToken:"${'t'.repeat(32)}",wire:${JSON.stringify(wire)}};`);
      if(url.pathname==='/api/get_signature.php')return Response.json({success:true,token:'fixture',exp:12345});
      if(url.pathname==='/api/get_playlist.php')return challenge?new Response('',{status:403,headers:{'cf-mitigated':'challenge'}}):Response.json({tracks:[{id:track.id,name:track.title,artists:[track.artist],duration_ms:200000}]});
      throw Error('Audio must not be requested during verification');
    }};
  const provider=new Spotisaver({browser,fetcher:()=>{throw Error('Must use the same browser session');}});
  t.after(()=>provider.closeBrowser());
  assert.equal(provider.beginVerification(track).state,'opening');await provider.verificationTask;
  assert.equal(opens,1);assert.equal(shown,1);assert.equal(provider.publicStatus().state,'needs-verification');assert.equal(provider.publicStatus().connected,false);
  challenge=false;await provider.checkVerification();assert.equal(provider.publicStatus().connected,true);
  assert(!requests.includes('/api/download_track.php'));
  provider.rateLimited=true;provider.retryAt=Date.now()+60000;
  await assert.rejects(provider.checkVerification(),/rate limited/);assert.throws(()=>provider.beginVerification(track),/rate limited/);
  await provider.closeBrowser();assert.equal(provider.publicStatus().connected,false);assert.equal(provider.verificationTimer?._destroyed,true);
});
