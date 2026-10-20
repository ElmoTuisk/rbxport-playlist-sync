import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Artwork,artworkUrl,albumArtwork} from '../src/artwork.mjs';
const jpg=Buffer.from([255,216,255,0]);
test('artwork URLs and redirects stay on provider CDNs; images are bounded and validated',async()=>{
 for(const raw of ['http://i.scdn.co/image/a','https://i.scdn.co.evil.test/a','https://image-cdn-fa.spotifycdn.com.evil.test/a','https://127.0.0.1/a','https://i.scdn.co:444/a','file:///a','https://user:pass@i.scdn.co/a'])assert.equal(artworkUrl(raw),null);
 assert.equal(artworkUrl('https://image-cdn-fa.spotifycdn.com/image/a'),'https://image-cdn-fa.spotifycdn.com/image/a');
 assert.equal(albumArtwork([{url:'https://i.scdn.co/image/a',width:64},{url:'https://i.scdn.co/image/b',width:640}]),'https://i.scdn.co/image/b');
 assert.equal(albumArtwork(null),null);assert.equal(albumArtwork('bad-metadata'),null);
 let requests=0;const a=new Artwork({fetcher:async()=>{requests++;return new Response(jpg);}});
 await a.image('https://i.scdn.co/image/a');await a.image('https://i.scdn.co/image/a');assert.equal(requests,1);
 for(const response of [new Response('<html>wrong</html>'),new Response(jpg,{headers:{'content-length':String(6*1024*1024)}}),new Response(null,{status:302,headers:{location:'http://127.0.0.1/private'}})]){
  const b=new Artwork({fetcher:async()=>response});await assert.rejects(b.image('https://i.scdn.co/image/a'));
 }
 const b=new Artwork({fetcher:async()=>new Response(new Uint8Array(5*1024*1024+1))});await assert.rejects(b.image('https://i.scdn.co/image/a'),/size limit/);
});
test('saved Spotify snapshots resolve the exact track cover with oEmbed; provider errors fall back to existing attached art',async t=>{
 const work=await mkdtemp(join(tmpdir(),'playlist-cover-'));t.after(()=>rm(work,{recursive:true,force:true}));
 const urls=[],calls=[],a=new Artwork({settings:()=>({ffmpeg:'ffmpeg',ffprobe:'ffprobe'}),fetcher:async url=>{urls.push(url);return url.includes('/oembed?')?Response.json({thumbnail_url:'https://image-cdn-fa.spotifycdn.com/image/a'}):new Response(jpg);},runner:async(exe,args)=>{calls.push(args);return '';}});
 const result=await a.prepare({provider:'spotify',id:'abc'},'audio.mp3',work);
 assert(result.path.endsWith('cover.jpg'));assert.equal(result.source,'spotify');assert.match(urls[0],/track%2Fabc$/);assert(calls[0].includes('-max_pixels'));
 a.fetcher=async()=>{throw Error('Unavailable');};a.runner=async(exe,args)=>exe==='ffprobe'?JSON.stringify({streams:[{index:2,codec_type:'video',width:600,height:600,disposition:{attached_pic:1}}]}):(calls.push(args),'');
 assert.equal((await a.prepare({provider:'spotify',id:'abc'},'audio.mp3',work)).source,'existing-cover');assert(calls.at(-1).includes('0:2'));
 a.runner=async()=>JSON.stringify({streams:[{index:0,codec_type:'video',width:600,height:600}]});assert.equal((await a.prepare({},'video.mp4',work)).status,'unavailable');
 const controller=new AbortController();controller.abort();await assert.rejects(a.prepare({},'audio.mp3',work,controller.signal));
});
