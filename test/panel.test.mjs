import test from 'node:test';
import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { mountPanel } from '../public/panel.mjs';

// Run the actual renderer/controller with a small event surface, without adding a DOM dependency.
// Native browser checks separately verify layout, scrolling and focus geometry.
function fixture() {
  const events = {};
  const document = { activeElement: null };
  const root = { innerHTML: '', contains: element => element !== null,
    addEventListener: (type, handler) => { events[type] = handler; }, querySelector: () => null };
  const row = (id, title) => ({ id, status: 'review', reason: 'No qualifying source', track: { title, artist: 'Fixture artist' } });
  const initial = { connected: true, selectionRevision: 1, selected: null, links: [
    { id: 'a', name: 'Fixture playlist A', lastCheck: 1 }, { id: 'b', name: 'Fixture playlist B', lastCheck: 1 }
  ], rows: { a: Array.from({length:85}, (_, i) => row(`a-${i}`, `Fixture song ${i}`)), b: [row('b-0', 'Different playlist song')] } };
  const mount = runInNewContext(`(${mountPanel.toString()})`, {document, requestAnimationFrame: callback => callback()});
  const controller = mount(root, initial, async () => ({ok:true}));
  const click = (action, id) => events.click({target:{closest: () => ({dataset:{action,id}})}});
  return {root, document, initial, controller, click};
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
