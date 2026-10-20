import test from 'node:test';
import assert from 'node:assert/strict';
import {setImmediate as turn} from 'node:timers/promises';
import {Downloads} from '../src/downloads.mjs';
import {startSearch} from '../src/discovery.mjs';

const track={provider:'spotify',title:'Fixture Recording',artist:'Fixture Artist',duration:200};
const item=(id,provider='soundcloud')=>({id,title:'Fixture Artist - Fixture Recording',artist:'Fixture Artist',duration:200,extractor:provider,
  webpage_url:provider==='youtube'?`https://www.youtube.com/watch?v=${id}`:`https://soundcloud.com/fixture/${id}`,
  formats:[{format_id:'download',ext:'mp3',acodec:'mp3',abr:320}]});
const waitForAbort=signal=>new Promise((resolve,reject)=>{
  if(signal.aborted)return reject(Error('Cancelled'));
  signal.addEventListener('abort',()=>reject(Error('Cancelled')),{once:true});
});

test('full candidate metadata streams before search completion, with two distinct providers and cleanup on success',async()=>{
  const calls=[],signals=[];let active=0,max=0,finished=0;
  const d=new Downloads(()=>({ytdlp:'fixture'}),{runner:async(exe,args,options)=>{
    calls.push(args);signals.push(options.signal);active++;max=Math.max(max,active);
    try{
      assert(args.includes('--dump-json'));assert(args.includes('--lazy-playlist'));assert(!args.includes('--flat-playlist'));
      assert.equal(options.collectStdout,false);
      options.onLine(JSON.stringify(item(args.at(-1).startsWith('scsearch')?'sc':'yt',args.at(-1).startsWith('scsearch')?'soundcloud':'youtube')));
      await waitForAbort(options.signal);
    }finally{active--;finished++;}
  }});
  const iterator=d.candidates(track,new AbortController().signal);
  const first=await iterator.next();
  assert.equal(first.value.id,'sc');assert.equal(first.value.formats[0].abr,320);
  assert.equal(first.value.discoverySource,'SoundCloud search');assert.equal(finished,0,'First usable metadata must not wait for ten full results');
  assert.equal(calls.length,2);assert.equal(max,2);assert(calls[0].at(-1).startsWith('scsearch10:'));assert(calls[1].at(-1).startsWith('ytsearch10:'));
  await iterator.return();assert.equal(active,0);assert.equal(finished,2);assert(signals.every(signal=>signal.aborted));
});

test('complete search keeps result order, later candidates, deduplication and all existing providers/variants',async()=>{
  const queries=[],d=new Downloads(()=>({ytdlp:'fixture'}),{runner:async(exe,args,options)=>{
    const url=args.at(-1);queries.push(url);
    if(url.startsWith('scsearch10:'))for(let i=0;i<10;i++)options.onLine(JSON.stringify(item(String(i))));
    else if(url.startsWith('ytsearch10:')){options.onLine(JSON.stringify(item('0')));options.onLine(JSON.stringify(item('unique','youtube')));}
    return '';
  }});
  const found=[];for await(const candidate of d.candidates({...track,title:'Fixture Recording - Alice Remix'}))found.push(candidate.id);
  assert.deepEqual(found,[...Array.from({length:10},(_,i)=>String(i)),'unique']);
  assert(queries[0].includes('Alice Remix'),'Single-artist remix labels must remain in the primary search');
  assert(queries.some(q=>q.includes('newgrounds.com/audio/search')));
  assert(queries.some(q=>q==='scsearch5:Fixture Artist Fixture Recording'));
  assert(queries.some(q=>q==='ytsearch5:Fixture Artist Fixture Recording'));
});

test('a failed prefetch is retried at its normal turn and never becomes a cached no-result',async()=>{
  let youtube=0;
  const d=new Downloads(()=>({}),{runner:async()=>{throw Error('Unexpected runner');}});
  d.metadata=async url=>{
    if(url.startsWith('scsearch')){await turn();return{entries:[]};}
    if(url.startsWith('ytsearch')){if(++youtube===1)throw Error('Temporary network failure');return{entries:[item('recovered','youtube')]};}
    return {entries:[]};
  };
  const found=[];for await(const candidate of d.candidates(track))found.push(candidate.id);
  assert.deepEqual(found,['recovered']);assert.equal(youtube,2);
});

test('original SoundCloud source stays first and a successful original starts no broad searches',async()=>{
  const calls=[],d=new Downloads(()=>({}));
  d.metadata=async url=>{calls.push(url);return item('original');};
  const iterator=d.candidates({...track,provider:'soundcloud',url:'https://soundcloud.com/fixture/original'});
  assert.equal((await iterator.next()).value.id,'original');await iterator.return();
  assert.deepEqual(calls,['https://soundcloud.com/fixture/original']);
});

test('a prefetched failure arriving during consumption also gets a fresh foreground attempt',async()=>{
  let youtube=0,release;
  const d=new Downloads(()=>({}));
  d.metadata=async url=>{
    if(url.startsWith('ytsearch')){
      if(++youtube===1){await new Promise(resolve=>{release=resolve;});throw Error('Delayed background timeout');}
      return{entries:[item('late-recovery','youtube')]};
    }return{entries:[]};
  };
  const iterator=d.candidates(track),pending=iterator.next();await turn();assert.equal(youtube,1);release();
  assert.equal((await pending).value.id,'late-recovery');await iterator.return();assert.equal(youtube,2);
});

test('malformed or unexpanded streamed results fall back to the original expanded search; snapshots never stream',async()=>{
  const calls=[],d=new Downloads(()=>({ytdlp:'fixture'}),{runner:async(exe,args,options)=>{
    calls.push(args);
    if(args.includes('--dump-json')){options.onLine(JSON.stringify({_type:'url',url:'https://soundcloud.com/fixture/stub'}));return '';}
    return JSON.stringify({entries:[item('full')]});
  }});
  const entries=[],result=await d.metadata('scsearch10:fixture',{playlist:true,search:true,onEntry:entry=>entries.push(entry)});
  assert.equal(result.entries[0].id,'full');assert.equal(entries.length,0);
  assert(calls[1].includes('--dump-single-json'));assert(!calls[1].includes('--lazy-playlist'));
  await assert.rejects(d.metadata('https://soundcloud.com/fixture/sets/source',{playlist:true,onEntry(){}}),/only allowed for candidate discovery/);
  assert.equal(calls.length,2);
});

test('streamed SoundCloud previews still obtain full-duration hints, while ordinary results avoid extra page reads',async()=>{
  let pages=0;
  const d=new Downloads(()=>({ytdlp:'fixture'}),{fetcher:async()=>{pages++;return new Response('<script>window.__sc_hydration = [{"hydratable":"sound","data":{"id":2,"downloadable":false,"duration":30000,"full_duration":200000,"policy":"SNIP"}}];</script>');},runner:async(exe,args,options)=>{
    if(args.at(-1).startsWith('scsearch')){
      options.onLine(JSON.stringify(item('1')));
      options.onLine(JSON.stringify({...item('2'),duration:30,formats:[{format_id:'http_mp3_preview',acodec:'mp3',ext:'mp3',abr:128}]}));
    }return '';
  }});
  const iterator=d.candidates(track),normal=await iterator.next();assert.equal(normal.value.id,'1');assert.equal(pages,0);
  const preview=await iterator.next();assert.equal(preview.value.duration,200);assert(preview.value.sourcePreview);assert.equal(pages,1);
  await iterator.return();
});

test('cancellation while awaiting metadata aborts both providers and stops subsequent searches',async()=>{
  const controller=new AbortController(),signals=[],d=new Downloads(()=>({ytdlp:'fixture'}),{runner:async(exe,args,options)=>{signals.push(options.signal);await waitForAbort(options.signal);}});
  const iterator=d.candidates(track,controller.signal),pending=iterator.next();await turn();assert.equal(signals.length,2);
  controller.abort();await assert.rejects(pending);assert(signals.every(signal=>signal.aborted));
});

test('metadata queues retain only their configured result limit and handle early errors without unhandled rejections',async()=>{
  const job=startSearch(async(signal,emit)=>{for(let i=0;i<100;i++)emit({id:i});return{streamed:true};},undefined,10);
  const ids=[];for await(const value of job.entries())ids.push(value.id);assert.deepEqual(ids,Array.from({length:10},(_,i)=>i));
  const failed=startSearch(async()=>{throw Error('Fixture failure');});await failed.settled;assert(failed.failed);
  await assert.rejects(async()=>{for await(const value of failed.entries())assert.fail();},/Fixture failure/);
});
