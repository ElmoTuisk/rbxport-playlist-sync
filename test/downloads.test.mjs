import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Downloads} from '../src/downloads.mjs';
import {candidateFormats,inspectAudio} from '../src/quality.mjs';
import {candidateCheck,searchVariants} from '../src/matching.mjs';
import {parsePublicSpotify,Providers,mediaUrl} from '../src/providers.mjs';
const track={key:'fixture:1',provider:'spotify',title:'Fixture Recording',artist:'Fixture Artist, Friend',duration:200};
const candidate=(id,changes={})=>({id,title:'Fixture Artist - Fixture Recording',uploader:'Fixture Artist',duration:200,webpage_url:`https://soundcloud.com/fixture/${id}`,formats:[{format_id:'original',ext:'mp3',acodec:'mp3',abr:320}],...changes});
async function fixture(t){
 const dir=await mkdtemp(join(tmpdir(),'playlist-sources-'));t.after(()=>rm(dir,{recursive:true,force:true}));const requests=[],downloaded=[];
 const d=new Downloads(()=>({musicFolder:dir,ytdlp:'fixture-ytdlp',ffmpeg:'fixture-ffmpeg'}),{runner:async(exe,args,options)=>{
  if(exe==='fixture-ytdlp'){const url=args.at(-1);downloaded.push(url);const path=args[args.indexOf('-o')+1].replace('%(ext)s','mp3');await writeFile(path,url.includes('/bad')?'128':'320');return '';}
  if(exe==='fixture-ffmpeg'){await writeFile(args.at(-1),await readFile(args[args.indexOf('-i')+1]));return '';}
  throw Error('Unexpected tool');
 }});
 d.verify=async(path)=>{const bitrate=Number(await readFile(path,'utf8'));if(bitrate!==320)throw Error('Quality check failed: source is 128 kbps');return{ok:true,codec:'mp3',bitrate:320};};
 d.metadata=async(url)=>{requests.push(url);return{entries:[]};};
 return{d,dir,requests,downloaded};
}
test('a failed or incorrectly advertised first file does not hide a valid second candidate',async t=>{
 const f=await fixture(t),updates=[];
 f.d.metadata=async()=>({entries:[candidate('bad'),null,candidate('good',{formats:[{format_id:'original',ext:'mp3'}]})]});
 const result=await f.d.acquire(track,{id:'test'},x=>updates.push(x),new AbortController().signal);
 assert.equal(result.quality.bitrate,320);assert.equal(f.downloaded.length,2);
 assert(result.attempts.some(a=>a.status==='quality'));assert(result.attempts.some(a=>a.status==='verified'));
});
test('a blocked provider does not stop discovery on another provider',async t=>{
 const f=await fixture(t);
 f.d.metadata=async(url)=>{f.requests.push(url);if(url.startsWith('scsearch'))throw Error('HTTP 403');return{entries:[candidate('good')]};};
 const result=await f.d.acquire(track,{id:'test'},()=>{},new AbortController().signal);
 assert.equal(result.quality.ok,true);assert.equal(f.requests.length,2);assert(result.attempts.some(a=>a.status==='unavailable'));
});
test('known low-quality formats are reported as found but rejected, not downloaded',async t=>{
 const f=await fixture(t);f.d.metadata=async()=>({entries:[candidate('low',{formats:[{format_id:'aac',acodec:'aac',ext:'m4a',abr:160}]})]});
 await assert.rejects(f.d.acquire(track,{id:'test'},()=>{},new AbortController().signal),e=>e.code==='QUALITY_REVIEW'&&/Recordings were found/.test(e.message));
 assert.equal(f.downloaded.length,0);
});
test('provisional metadata never approves a known low-bitrate or wrong-codec MP3',()=>{
 assert.equal(candidateFormats({formats:[{ext:'mp3'}]}).length,1);
 for(const bad of [{ext:'mp3',acodec:'aac'},{ext:'mp3',abr:128},{ext:'mp3',bit_rate:'128000'}])assert.equal(candidateFormats({formats:[bad]}).length,0);
});
test('discovery tolerates missing length while known wrong lengths and versions remain rejected',()=>{
 assert.equal(candidateCheck(track,candidate('x',{duration:0}),{allowUnknownDuration:true}).ok,true);
 assert.equal(candidateCheck(track,candidate('x',{duration:250}),{allowUnknownDuration:true}).ok,false);
 assert.equal(candidateCheck(track,candidate('x',{title:'Fixture Artist - Fixture Recording VIP'})).ok,false);
 const collab={...track,title:'Fixture Recording (feat. Friend)'};
 assert.equal(candidateCheck(collab,candidate('x')).ok,true);
 assert.equal(candidateCheck({...track,title:'Fixture Recording - Alice Remix'},candidate('x',{title:'Fixture Artist - Fixture Recording - Bob Remix'})).ok,false);
 assert(searchVariants(collab).some(q=>q.artist==='Fixture Artist'&&q.title==='Fixture Recording'));
});
test('cancellation stops source failover rather than querying every provider',async t=>{
 const f=await fixture(t),controller=new AbortController();let calls=0;
 f.d.metadata=async()=>{calls++;controller.abort();throw Error('Cancelled');};
 await assert.rejects(f.d.acquire(track,{id:'test'},()=>{},controller.signal));assert.equal(calls,1);
});
const html=(items,total=items.length,nextOffset=null)=>'<script id="initialState" type="text/plain">'+Buffer.from(JSON.stringify({entities:{items:{'spotify:playlist:fixture':{name:'Fixture playlist',content:{items,totalCount:total,pagingInfo:{nextOffset}}}}}})).toString('base64')+'</script>';
const item={itemV2:{data:{__typename:'Track',uri:'spotify:track:abc',name:'Fixture Recording',artists:{items:[{profile:{name:'Fixture Artist'}}]},duration:{totalMilliseconds:200000}}}};
test('public Spotify reads require a proven complete snapshot and never accept an embed/partial page',()=>{
 assert.equal(parsePublicSpotify(html([item]),'fixture').tracks[0].duration,200);
 for(const page of [html([item],500),html([item],1,1),'<script id="__NEXT_DATA__">{}</script>'])assert.throws(()=>parsePublicSpotify(page,'fixture'),/partial public playlist/);
 assert.throws(()=>parsePublicSpotify(html([item]),'other'),/partial public playlist/);
});
test('public-read fallback is used for Spotify access restrictions but not rate limits or partial API data',async()=>{
 const p=new Providers({async playlist(){throw Error('Spotify denied playlist access.');}},{});let reads=0;p.publicSpotify=async()=>{reads++;return{tracks:[]};};
 await p.playlist({provider:'spotify',id:'fixture'});assert.equal(reads,1);
 for(const error of [Object.assign(Error('Quota'),{retryAt:1}),Error('Incomplete playlist')]){p.spotify.playlist=async()=>{throw error;};await assert.rejects(p.playlist({provider:'spotify'}));}assert.equal(reads,1);
});
test('Newgrounds originals can be selected without allowing arbitrary sites or file URLs',()=>{
 assert.equal(mediaUrl('https://www.newgrounds.com/audio/listen/123'),'https://www.newgrounds.com/audio/listen/123');
 for(const url of ['https://newgrounds.com/portal/view/1','https://evil.newgrounds.com/audio/listen/1','http://newgrounds.com/audio/listen/1'])assert.throws(()=>mediaUrl(url));
});

test('AAC acceptance is codec-specific and requires an explicit 256 kbps policy',()=>{
 const low={codec_type:'audio',codec_name:'aac',bit_rate:'160000',sample_rate:'44100',channels:2,duration:'200'};
 const high={...low,bit_rate:'256000'};
 assert.equal(inspectAudio({streams:[high]},200).ok,false);
 assert.equal(inspectAudio({streams:[high]},200,{policy:'club-aac-256'}).ok,true);
 assert.equal(inspectAudio({streams:[low]},200,{policy:'club-aac-256'}).ok,false);
 assert.equal(candidateFormats({formats:[{ext:'m4a',acodec:'mp4a.40.2',abr:256}]},{policy:'club-aac-256'}).length,1);
 assert.equal(candidateFormats({formats:[{ext:'m4a',acodec:'mp4a.40.2',abr:160}]},{policy:'club-aac-256'}).length,0);
});

test('original-mix labels do not hide the original, while remix names still must match',()=>{
 assert.equal(candidateCheck({...track,title:'Fixture Recording - Original Mix'},candidate('original')).ok,true);
 assert.equal(candidateCheck({...track,title:'Fixture Recording - Alice Remix'},candidate('wrong',{title:'Fixture Artist - Fixture Recording - Bob Remix'})).ok,false);
});
