import test from 'node:test';
import assert from 'node:assert/strict';
import {SoundCloudPages,soundcloudPageHints} from '../src/soundcloud.mjs';
import {Downloads} from '../src/downloads.mjs';
import {candidateFormats,lowerQualityFormats} from '../src/quality.mjs';
const html=data=>`<script>window.__sc_hydration = ${JSON.stringify(data)};</script>`;
const item={id:1,title:'Fixture',downloadable:false,duration:30000,full_duration:185182,policy:'SNIP'};

test('public SoundCloud hints retain full recording length, official download and external gate indicators',()=>{
 const hints=soundcloudPageHints(html([{hydratable:'sound',data:{...item,downloadable:true,purchase_url:'https://hypeddit.com/fixture',purchase_title:'Free download'}}]));
 assert.equal(hints[0].duration,185.182);assert(hints[0].preview);assert(hints[0].downloadable);assert(hints[0].external);
 assert(!JSON.stringify(hints).includes('hypeddit.com'),'Hints do not retain an external media URL');
});

test('SoundCloud page hints are bounded, cached and ignore partial playlist objects',async()=>{
 let calls=0,now=1;const pages=new SoundCloudPages(async()=>{calls++;return new Response(html([{hydratable:'playlist',data:{tracks:[item,{id:2,policy:'SNIP'}]}}]));},{clock:()=>now,limit:2,ttl:100});
 await pages.read('https://soundcloud.com/fixture/sets/list?si=tracking');
 assert.equal((await pages.track({id:1,webpage_url:'https://soundcloud.com/fixture/song'})).duration,185.182);assert.equal(calls,1);
 assert.equal(await pages.track({id:2},{},{fetchMissing:false}),null);
 for(const n of [2,3,4])await pages.read('https://soundcloud.com/fixture/page'+n);
 assert.equal(pages.pages.size,2);assert(pages.tracks.size<=2);
 now=200;await pages.read('https://soundcloud.com/fixture/page4');assert.equal(calls,5);
});

test('preview formats cannot become ordinary or approved lower-quality downloads; official originals are preferred',()=>{
 const preview={format_id:'http_mp3_1_0_preview',ext:'mp3',acodec:'mp3',abr:320},original={format_id:'download',ext:'mp3',abr:128,acodec:'mp3'},high={format_id:'stream',ext:'mp3',acodec:'mp3',abr:320};
 const info={extractor:'soundcloud',formats:[preview,high,original]};
 assert.deepEqual(candidateFormats(info,{allowLowerOfficial:true}).map(f=>f.format_id),['download','stream']);
 assert.deepEqual(candidateFormats(info).map(f=>f.format_id),['stream']);
 assert(!lowerQualityFormats({...info,formats:[{...preview,abr:128}]}).length);
 assert(!candidateFormats({...info,extractor:'youtube',formats:[original]},{allowLowerOfficial:true}).length);
});

test('playlist metadata corrects preview duration and primes a bounded original-source cache',async()=>{
 let runs=0,now=1;const entry={id:'1',extractor:'soundcloud',title:'Fixture',webpage_url:'https://soundcloud.com/fixture/song',duration:30,formats:[{format_id:'http_mp3_preview',ext:'mp3',acodec:'mp3',abr:128}]};
 const d=new Downloads(()=>({ytdlp:'fixture'}),{clock:()=>now,fetcher:async()=>new Response(html([{hydratable:'sound',data:item}])),runner:async()=>{runs++;return JSON.stringify(runs===1?{extractor:'soundcloud:set',entries:[entry]}:entry);}});
 const playlist=await d.metadata('https://soundcloud.com/fixture/sets/list',{playlist:true});
 assert.equal(playlist.entries[0].duration,185.182);assert(playlist.entries[0].sourcePreview);
 assert.equal((await d.metadata(entry.webpage_url)).duration,185.182);assert.equal(runs,1);
 assert(!JSON.stringify([...d.metadataCache.values()]).includes('transcodings'));
 const c=new AbortController();c.abort();await assert.rejects(d.metadata(entry.webpage_url,{signal:c.signal}));assert.equal(runs,1);
 now=300002;await d.metadata(entry.webpage_url);assert.equal(runs,2);
});

test('original metadata cache keeps only bounded audio discovery fields, not signed media URLs or descriptions',()=>{
 const d=new Downloads(()=>({}));
 for(let i=0;i<140;i++)d.cache({id:String(i),extractor:'soundcloud',title:'Fixture',webpage_url:'https://soundcloud.com/fixture/'+i,description:'private description',formats:[{format_id:'download',ext:'mp3',url:'https://cdn.invalid/signed-token',http_headers:{Authorization:'private'}}]});
 assert.equal(d.metadataCache.size,128);assert(!d.metadataCache.has('https://soundcloud.com/fixture/0'));
 const saved=JSON.stringify([...d.metadataCache.values()]);assert(!saved.includes('signed-token'));assert(!saved.includes('private'));
});
