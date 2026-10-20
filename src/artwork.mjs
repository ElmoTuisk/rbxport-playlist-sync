import {writeFile} from 'node:fs/promises';
import {join} from 'node:path';

// Only provider image CDNs. Never give a remote URL or playlist to FFmpeg.
export function artworkUrl(raw) {
  try {
    const u=new URL(raw);
    if(u.protocol!=='https:' || u.username || u.password || u.port)return null;
    return (u.hostname==='i.scdn.co' || /^image-cdn-[a-z0-9-]{1,20}\.spotifycdn\.com$/.test(u.hostname) || /^i[1-4]\.sndcdn\.com$/.test(u.hostname)) ? u.href : null;
  } catch { return null; }
}
export function albumArtwork(images=[]) {
  return (Array.isArray(images)?[...images]:[]).filter(i=>artworkUrl(i?.url)).sort((a,b)=>Number(b.width || 0)-Number(a.width || 0))[0]?.url || null;
}
async function boundedBody(response,limit) {
  if(!response.ok || !response.body || Number(response.headers.get('content-length'))>limit){await response.body?.cancel();throw Error('Artwork response unavailable or too large');}
  const chunks=[];let size=0;
  for await(const chunk of response.body){size+=chunk.length;if(size>limit)throw Error('Artwork exceeded size limit');chunks.push(chunk);}
  return Buffer.concat(chunks);
}
export class Artwork {
  constructor({fetcher=fetch,runner,settings,clock=Date.now}){Object.assign(this,{fetcher,runner,settings,clock});this.cache=new Map();this.bytes=0;}
  async image(url,signal) {
    url=artworkUrl(url);if(!url)throw Error('Unsupported artwork URL');
    const cached=this.cache.get(url);if(cached?.expires>this.clock())return cached.body;
    const key=url;
    for(let n=0;n<4;n++){
      const response=await this.fetcher(url,{redirect:'manual',signal});
      if([301,302,303,307,308].includes(response.status)){
        const next=artworkUrl(new URL(response.headers.get('location'),url).href);await response.body?.cancel();
        if(!next)throw Error('Unsupported artwork redirect');url=next;continue;
      }
      const body=await boundedBody(response,5*1024*1024);
      const jpeg=body[0]===255&&body[1]===216&&body[2]===255,png=body.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
      const webp=body.toString('ascii',0,4)==='RIFF'&&body.toString('ascii',8,12)==='WEBP';
      if(!jpeg&&!png&&!webp)throw Error('Unsupported artwork image');
      if(cached){this.bytes-=cached.body.length;this.cache.delete(key);}
      this.cache.set(key,{body,expires:this.clock()+1800000});this.bytes+=body.length;
      while(this.cache.size>32 || this.bytes>8*1024*1024){const first=this.cache.keys().next().value;this.bytes-=this.cache.get(first).body.length;this.cache.delete(first);}
      return body;
    }
    throw Error('Too many artwork redirects');
  }
  async prepare(track,sourcePath,work,signal) {
    signal?.throwIfAborted();
    const deadline=AbortSignal.any([signal,AbortSignal.timeout(15000)].filter(Boolean));
    const output=join(work,'cover.jpg'),s=this.settings();
    let url=artworkUrl(track.artworkUrl),provider=track.provider;
    try {
      // Old saved snapshots have no image field. oEmbed looks up this exact track,
      // without requiring another Spotify authorization or guessing an album.
      if(!url && track.provider==='spotify' && /^[A-Za-z0-9]+$/.test(track.id || '')){
        const response=await this.fetcher(`https://open.spotify.com/oembed?url=${encodeURIComponent('https://open.spotify.com/track/'+track.id)}`,{redirect:'error',signal:deadline});
        url=artworkUrl(JSON.parse((await boundedBody(response,65536)).toString()).thumbnail_url);
      }
      if(url){
        const input=join(work,'cover-image');await writeFile(input,await this.image(url,deadline));
        await this.runner(s.ffmpeg,['-y','-v','error','-nostdin','-max_alloc','33554432','-protocol_whitelist','file,pipe','-max_pixels','20000000','-i',input,'-map','0:v:0','-frames:v','1','-vf',"scale=w='min(1200,iw)':h='min(1200,ih)':force_original_aspect_ratio=decrease",'-c:v','mjpeg','-q:v','3',output],{signal:deadline,timeout:15000});
        return {path:output,source:provider || 'provider'};
      }
    } catch(error){if(signal?.aborted)throw error;}
    // Preserve an existing real attached cover. A video frame/YouTube thumbnail
    // is not treated as album artwork.
    try {
      const fallbackSignal=AbortSignal.any([signal,AbortSignal.timeout(8000)].filter(Boolean));
      const probe=JSON.parse(await this.runner(s.ffprobe,['-v','error','-show_streams','-of','json',sourcePath],{signal:fallbackSignal,timeout:8000}));
      const pic=probe.streams?.find(v=>v.codec_type==='video'&&v.disposition?.attached_pic&&v.width>0&&v.height>0&&v.width*v.height<=20000000);
      if(pic){
        await this.runner(s.ffmpeg,['-y','-v','error','-nostdin','-max_alloc','33554432','-protocol_whitelist','file,pipe','-i',sourcePath,'-map',`0:${pic.index}`,'-frames:v','1','-vf',"scale=w='min(1200,iw)':h='min(1200,ih)':force_original_aspect_ratio=decrease",'-c:v','mjpeg','-q:v','3',output],{signal:fallbackSignal,timeout:8000});
        return {path:output,source:'existing-cover'};
      }
    }catch(error){if(signal?.aborted)throw error;}
    return {path:null,status:'unavailable',message:'Album cover unavailable; audio download kept'};
  }
}
