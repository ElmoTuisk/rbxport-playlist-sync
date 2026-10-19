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

test('bulk preview requires its separate confirmation and makes alternate versions an explicit option',async()=>{
 const calls=[];const f=fixture(async(action,args)=>{calls.push({action,args});if(action==='match-plan')return{id:'a',includeAlternates:args.includeAlternates,signature:'b'.repeat(64),skipped:1,entries:Array.from({length:args.includeAlternates?3:2},()=>({title:'Fixture',localTitle:'Local fixture',localDuration:200,duration:190,alternate:args.includeAlternates}))};if(action==='accept-matches')return{message:'3 existing matches accepted.'};return{ok:true};});
 const initial={...f.initial,rows:{...f.initial.rows,a:f.initial.rows.a.map(r=>({...r,reviewKind:'match'}))}};
 f.controller.update({...initial,selected:'a',selectionRevision:2});await f.click('bulk-open','a');
 assert.match(f.root.innerHTML,/Accept 2 matches and apply source order\?/);assert.match(f.root.innerHTML,/extra songs at the bottom/);assert.match(f.root.innerHTML,/Accept 2 & reorder/);assert(!calls.some(c=>c.action==='accept-matches'));
 await f.events.change({target:{checked:true,hasAttribute:name=>name==='data-bulk-alternates'}});
 assert.match(f.root.innerHTML,/Accept 3 matches and apply source order\?/);assert.match(f.root.innerHTML,/Some local versions differ/);
 await f.click('bulk-confirm','a');const call=calls.find(c=>c.action==='accept-matches');assert.equal(call.args.includeAlternates,true);assert.equal(call.args.signature,'b'.repeat(64));assert.match(f.root.innerHTML,/3 existing matches accepted/);assert.doesNotMatch(f.root.innerHTML,/data-bulk-preview/);
});
