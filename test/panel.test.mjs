import test from 'node:test';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { mountPanel } from '../public/panel.mjs';

// Run the actual renderer/controller with a small event surface, without adding a DOM dependency.
// Native browser checks separately verify layout, scrolling and focus geometry.
function fixture(send=async()=>({ok:true})) {
  const events = {};
  const document = { activeElement: null };
  const root = { innerHTML: '', contains: element => element !== null,
    addEventListener: (type, handler) => { events[type] = handler; }, querySelector: () => null };
  const row = (id, title) => ({ id, status: 'review', reason: 'No qualifying source', track: { title, artist: 'Fixture artist' } });
  const initial = { connected: true, selectionRevision: 1, selected: null, links: [
    { id: 'a', name: 'Fixture playlist A', lastCheck: 1 }, { id: 'b', name: 'Fixture playlist B', lastCheck: 1 }
  ], rows: { a: Array.from({length:85}, (_, i) => row(`a-${i}`, `Fixture song ${i}`)), b: [row('b-0', 'Different playlist song')] } };
  const mount = runInNewContext(`(${mountPanel.toString()})`, {document,FormData:class{constructor(form){return Object.entries(form.values || {});}}, requestAnimationFrame: callback => callback()});
  const controller = mount(root, initial, send);
  const click = (action, id) => events.click({target:{closest: () => ({dataset:{action,id}})}});
  return {root, document, initial, controller, click,events};
}

test('Resolve opens immediately after the chosen song in a long missing-track list', async () => {
  const {root, initial, controller, click} = fixture();
  controller.update({...initial, selected:'a', selectionRevision:2});
  await click('review', 'a-42');
  const before = root.innerHTML.indexOf('Fixture song 42');
  const form = root.innerHTML.indexOf('<form data-form="resolve" data-id="a-42"');
  const after = root.innerHTML.indexOf('Fixture song 43');
  assert(before >= 0 && form > before && after > form, 'The form belongs next to its song, not after all 85 rows');
  assert.equal((root.innerHTML.match(/data-form="resolve"/g) || []).length, 1);
  assert.match(root.innerHTML, /No qualifying source/);
  await click('review', 'a-42');
  assert.doesNotMatch(root.innerHTML, /data-form="resolve"/);
});

test('lower-quality download requires a separate confirmation and source URL drafts survive errors and refreshes',async()=>{
 const calls=[],f=fixture(async(action,args)=>{calls.push({action,args});if(args.action==='source')throw Error('Source unavailable; URL kept');return{message:'Lower-quality exception approved. Starting download.'};});
 const option={id:'a'.repeat(64),url:'https://soundcloud.com/fixture/low',title:'Fixture lower file',codec:'mp3',bitrate:128,label:'MP3 · 128 kbps · reported',duration:200};
 const model={...f.initial,selected:'a',selectionRevision:2,jobs:[{rowId:'a-0',status:'review',overrideUrl:option.url,lowerOptions:[option]}]};
 f.controller.update(model);await f.click('review','a-0');assert.match(f.root.innerHTML,/Lower-quality audio available/);assert.match(f.root.innerHTML,/value="https:\/\/soundcloud.com\/fixture\/low"/);
 await f.click('lower-review','a-0');assert.match(f.root.innerHTML,/Confirm & download/);assert.equal(calls.length,0);
 await f.click('lower-confirm','a-0');assert.equal(calls.length,1);assert.equal(calls[0].args.action,'lower');assert.equal(calls[0].args.optionId,option.id);assert.match(f.root.innerHTML,/Starting download/);
 const edited='https://soundcloud.com/fixture/edited';
 await f.events.submit({preventDefault(){},target:{dataset:{form:'resolve',id:'a-0'},values:{action:'source',url:edited}}});
 assert.match(f.root.innerHTML,/Source unavailable; URL kept/);assert.match(f.root.innerHTML,/value="https:\/\/soundcloud.com\/fixture\/edited"/);assert.match(f.root.innerHTML,/data-form="resolve"/);
 f.controller.update({...model,revision:3});assert.match(f.root.innerHTML,/value="https:\/\/soundcloud.com\/fixture\/edited"/);
});

test('selecting another playlist refreshes visible rows even while an old resolution field has focus', async () => {
  const {root, document, initial, controller, click} = fixture();
  controller.update({...initial, selected:'a', selectionRevision:2});
  await click('review', 'a-0');
  document.activeElement = {tagName:'SELECT'};
  controller.update({...initial, selected:'b', selectionRevision:3});
  assert.match(root.innerHTML, /Different playlist song/);
  assert.doesNotMatch(root.innerHTML, /Fixture song 0|data-form="resolve"/);
});

test('source attempt details remain collapsed and escape provider text',async()=>{
 const{root,initial,controller,click}=fixture();controller.update({...initial,selected:'a',selectionRevision:2,jobs:[{rowId:'a-0',attempts:[{source:'Fixture source',status:'quality',message:'Found <script> below quality'}]}]});await click('review','a-0');
 assert.match(root.innerHTML,/<details class="ps-more"><summary>Source attempts/);assert.match(root.innerHTML,/Found &lt;script&gt; below quality/);assert.doesNotMatch(root.innerHTML,/Found <script>/);
 assert.match(root.innerHTML,/Retry missing/);
});

test('lower-only results show quality and a review action before opening the song', async () => {
 const f=fixture();
 const model={...f.initial,selected:'a',selectionRevision:2,jobs:[{rowId:'a-0',status:'review',lowerOptions:[
  {id:'low',codec:'aac',bitrate:96},{id:'best',codec:'aac',bitrate:160}
 ]}]};
 f.controller.update(model);
 assert.match(f.root.innerHTML,/<small class="ps-quality">Lower-quality alternatives available · AAC 160 kbps · reported<\/small>/);
 assert.match(f.root.innerHTML,/data-id="a-0" aria-expanded="false">Review quality<\/button>/);
 assert.doesNotMatch(f.root.innerHTML,/Fixture artist · Only lower-quality/);
 f.events.toggle({target:{dataset:{allTracks:'a'},open:true}});
 assert.match(f.root.innerHTML,/Fixture artist · Lower-quality alternatives available · AAC 160 kbps · reported/);
 assert.match(f.root.innerHTML,/data-id="a-1" aria-expanded="false">Resolve<\/button>/);
 assert.doesNotMatch(f.root.innerHTML,/data-form="resolve"/);
 await f.click('review','a-0');
 assert.match(f.root.innerHTML,/data-quality-review/);
 assert.doesNotMatch(f.root.innerHTML,/Confirm & download/);
});

test('quality labels distinguish ongoing searches, approvals, verified files and unknown bitrate', () => {
 const f=fixture(),base={...f.initial,selected:'a',selectionRevision:2};
 const option={id:'offer',codec:'opus',bitrate:127,verified:false};
 const update=job=>f.controller.update({...base,jobs:[{rowId:'a-0',lowerOptions:[option],...job}]});
 update({status:'searching'});
 assert.match(f.root.innerHTML,/Searching sources for audio at your standard/);
 assert.doesNotMatch(f.root.innerHTML,/class="ps-quality"/);
 assert.doesNotMatch(f.root.innerHTML,/Only lower-quality audio found/);
 update({status:'queued',qualityApproval:option});
 assert.match(f.root.innerHTML,/Lower-quality download approved · OPUS 127 kbps · reported/);
 assert.doesNotMatch(f.root.innerHTML,/>Review quality<\/button>/);
 update({status:'review',lowerOptions:[option,{id:'actual',codec:'aac',bitrate:0,verified:true}]});
 assert.match(f.root.innerHTML,/Lower-quality alternatives available · AAC · bitrate unknown · verified/);
 assert.doesNotMatch(f.root.innerHTML,/AAC 0 kbps/);
 f.controller.update({...base,rows:{...base.rows,a:[{...base.rows.a[0],status:'ready',audioQuality:{belowStandard:true,codec:'aac',bitrate:160}}]},jobs:[{rowId:'a-0',status:'ready',lowerOptions:[option],qualityApproval:option}]});
 f.events.toggle({target:{dataset:{allTracks:'a'},open:true}});
 assert.match(f.root.innerHTML,/ready · LOWER AAC 160 kbps/);
 assert.doesNotMatch(f.root.innerHTML,/Only lower-quality audio found|Lower-quality download approved|Review quality/);
});

test('fallback downloads show current verification instead of stale lower web alternatives in both lists',()=>{
 const f=fixture(),row={...f.initial.rows.a[0],status:'missing'},base={...f.initial,selected:'a',selectionRevision:2,rows:{a:[row]}};
 const low={id:'web-low',codec:'aac',bitrate:130},job={rowId:row.id,acquisition:'soulseek',lowerOptions:[low]};
 const update=fields=>f.controller.update({...base,jobs:[{...job,...fields}]});
 update({status:'searching'});assert.match(f.root.innerHTML,/Searching Soulseek for audio at your standard/);assert.doesNotMatch(f.root.innerHTML,/ps-quality|Review quality|Only lower-quality/);
 update({status:'downloading'});assert.match(f.root.innerHTML,/Downloading from Soulseek · quality check pending/);assert.doesNotMatch(f.root.innerHTML,/320 kbps verified|ps-quality/);
 f.events.toggle({target:{dataset:{allTracks:'a'},open:true}});
 assert.equal((f.root.innerHTML.match(/Downloading from Soulseek · quality check pending/g)||[]).length,2);
 const verified={sourcePath:'verified-source.mp3',sourceReport:{ok:true,codec:'mp3',bitrate:320,belowStandard:false}};
 for(const status of ['validating','importing','analysing']){
  update({status,...verified});assert.match(f.root.innerHTML,/MP3 320 kbps verified/);assert.doesNotMatch(f.root.innerHTML,/ps-quality|Review quality|AAC 130/);
 }
 update({status:'validating',qualityApproval:low,...verified});assert.doesNotMatch(f.root.innerHTML,/ps-quality|Lower-quality download approved/);
 const quality={ok:true,codec:'mp3',bitrate:320,belowStandard:false};
 f.controller.update({...base,rows:{a:[{...row,status:'ready'}]},jobs:[{...job,status:'ready',quality,file:'download.mp3'}]});
 assert.match(f.root.innerHTML,/Ready · MP3 320 kbps · verified/);assert.doesNotMatch(f.root.innerHTML,/ps-quality|Review quality/);
 update({status:'failed',file:'download.mp3',quality});assert.match(f.root.innerHTML,/MP3 320 kbps verified · import needs retry/);assert.doesNotMatch(f.root.innerHTML,/ps-quality|Review quality/);
 update({status:'review'});assert.match(f.root.innerHTML,/class="ps-quality">Lower-quality alternatives available · AAC 130 kbps · reported/);
 update({status:'downloading',qualityApproval:low});assert.match(f.root.innerHTML,/class="ps-quality">Lower-quality download approved/);
});

test('initial lower-quality originals are distinguished from a finished search and previews stay explicit',async()=>{
 const f=fixture(),base={...f.initial,selected:'a',selectionRevision:2};
 f.controller.update({...base,rows:{...base.rows,a:[{...base.rows.a[0],track:{...base.rows.a[0].track,sourceAudio:{preview:true}}},base.rows.a[1]]},jobs:[{rowId:'a-1',status:'queued',originalOnly:true,lowerOptions:[{codec:'aac',bitrate:160}]}]});
 assert.match(f.root.innerHTML,/SoundCloud preview only · full recording needed/);
 assert.match(f.root.innerHTML,/Lower-quality original stream available · AAC 160 kbps/);
 assert.doesNotMatch(f.root.innerHTML,/Only lower-quality audio found/);
 await f.click('review','a-1');
 assert.match(f.root.innerHTML,/Review lower-quality file/);
});

test('ready rows under All tracks render only when the list is expanded',()=>{
 const f=fixture(),ready=Array.from({length:900},(_,i)=>({id:String(i),status:'ready',track:{title:'Ready song '+i,artist:'Fixture'}}));
 f.controller.update({...f.initial,selected:'a',selectionRevision:2,rows:{a:ready}});
 assert.doesNotMatch(f.root.innerHTML,/Ready song 899/);
 f.events.toggle({target:{dataset:{allTracks:'a'},open:true}});assert.match(f.root.innerHTML,/Ready song 899/);
 f.events.toggle({target:{dataset:{allTracks:'a'},open:false}});assert.doesNotMatch(f.root.innerHTML,/Ready song 899/);
});

test('playlist bulk quality uses one reviewed confirmation and starts a queue without per-song approval clicks',async()=>{
 const calls=[],f=fixture(async(action,args)=>{calls.push({action,args});return action==='quality-plan'?{signature:'a'.repeat(64),skipped:1,entries:[{rowId:'a-0',title:'Fixture song 0',codec:'aac',bitrate:160,verified:false},{rowId:'a-1',title:'Fixture song 1',codec:'mp3',bitrate:128,verified:true}]}:{message:'2 lower-quality downloads approved. Starting queue.'};});
 f.controller.update({...f.initial,selected:'a',selectionRevision:2,jobs:[{rowId:'a-0',status:'review',lowerOptions:[{codec:'aac',bitrate:160}]}]});
 assert.match(f.root.innerHTML,/Accept lower quality…/);await f.click('quality-bulk-open','a');
 assert.match(f.root.innerHTML,/Accept lower quality for 2 songs\?/);assert.match(f.root.innerHTML,/AAC · 160 kbps · reported/);assert.match(f.root.innerHTML,/MP3 · 128 kbps · verified/);assert.match(f.root.innerHTML,/Accept 2 & download/);assert(!calls.some(c=>c.action==='accept-quality'));
 await f.click('quality-bulk-confirm','a');const call=calls.find(c=>c.action==='accept-quality');assert.equal(call.args.signature,'a'.repeat(64));assert.equal(call.args.id,'a');assert.match(f.root.innerHTML,/Starting queue/);assert.doesNotMatch(f.root.innerHTML,/data-bulk-quality/);
});

test('cancelling or switching playlists closes the bulk quality preview without approvals',async()=>{
 const calls=[],f=fixture(async(action,args)=>{calls.push({action,args});return{signature:'a'.repeat(64),entries:[{title:'Fixture',codec:'aac',bitrate:160}]};});
 f.controller.update({...f.initial,selected:'a',selectionRevision:2});await f.click('quality-bulk-open','a');await f.click('quality-bulk-dismiss','a');assert.doesNotMatch(f.root.innerHTML,/data-bulk-quality/);
 await f.click('quality-bulk-open','a');f.controller.update({...f.initial,selected:'b',selectionRevision:3});assert.doesNotMatch(f.root.innerHTML,/data-bulk-quality/);assert(!calls.some(c=>c.action==='accept-quality'));
});

test('bulk preview requires its separate confirmation and makes alternate versions an explicit option',async()=>{
 const calls=[];const f=fixture(async(action,args)=>{calls.push({action,args});if(action==='match-plan')return{id:'a',includeAlternates:args.includeAlternates,signature:'b'.repeat(64),skipped:1,entries:Array.from({length:args.includeAlternates?3:2},()=>({title:'Fixture',localTitle:'Local fixture',localDuration:200,duration:190,alternate:args.includeAlternates}))};if(action==='accept-matches')return{message:'3 existing matches accepted.'};return{ok:true};});
 const initial={...f.initial,rows:{...f.initial.rows,a:f.initial.rows.a.map(r=>({...r,reviewKind:'match'}))}};
 f.controller.update({...initial,selected:'a',selectionRevision:2});await f.click('bulk-open','a');
 assert.match(f.root.innerHTML,/Accept 2 matches and apply source order\?/);assert.match(f.root.innerHTML,/extra songs at the bottom/);assert.match(f.root.innerHTML,/Accept 2 & reorder/);assert(!calls.some(c=>c.action==='accept-matches'));
 await f.events.change({target:{checked:true,hasAttribute:name=>name==='data-bulk-alternates'}});
 assert.match(f.root.innerHTML,/Accept 3 matches and apply source order\?/);assert.match(f.root.innerHTML,/Some local versions differ/);
 await f.click('bulk-confirm','a');const call=calls.find(c=>c.action==='accept-matches');assert.equal(call.args.includeAlternates,true);assert.equal(call.args.signature,'b'.repeat(64));assert.match(f.root.innerHTML,/3 existing matches accepted/);assert.doesNotMatch(f.root.innerHTML,/data-bulk-preview/);
});
