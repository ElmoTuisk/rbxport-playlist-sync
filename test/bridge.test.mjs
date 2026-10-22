import test from 'node:test';
import assert from 'node:assert/strict';
import { Bridge, hostErrorMessage } from '../src/bridge.mjs';
import { installHostUi, fitPopover } from '../src/host-ui.mjs';
import { mountPanel } from '../public/panel.mjs';

test('host diagnostics omit injected script stacks without dropping the useful error', () => {
  assert.equal(hostErrorMessage({ exception: { description: 'Error: Command database_drives not found\n    at <anonymous>:1:673' } }), 'Command database_drives not found');
  assert.equal(hostErrorMessage({ exception: { description: 'Error: Wrong library; operation refused\n    at <anonymous>:1:42' } }), 'Wrong library; operation refused');
  assert.equal(hostErrorMessage({ text: 'Connection unavailable' }), 'Connection unavailable');
  assert.equal(hostErrorMessage({}), 'rbxport operation failed');
});

test('independent add-ons share a native write lease without changing library guards',async()=>{
  const bridge=new Bridge();bridge.socket={readyState:WebSocket.OPEN};let expression;
  bridge.request=async(method,args)=>{expression=args.expression;};
  await bridge.call('add',{libraryId:'fixture',playlistId:'target',ids:['song']});
  const write=new Function('window','return '+expression);let additions=0,finish;
  const window={__rbxportAddonWriteLease:{owner:'playlist-wizard'},__TAURI_INTERNALS__:{invoke:async(name)=>{
    if(name==='database_drives')return [{current:true,masterDb:'FIXTURE'}];
    if(name==='playlist_duplicates')return [];
    if(name==='add_tracks_to_playlist'){additions++;await new Promise(resolve=>{finish=resolve;});}
  }}};
  await assert.rejects(write(window),/Another add-on/);assert.equal(additions,0);assert.equal(window.__rbxportAddonWriteLease.owner,'playlist-wizard');
  delete window.__rbxportAddonWriteLease;const pending=write(window);
  for(let i=0;i<5&&!finish;i++)await new Promise(resolve=>setImmediate(resolve));
  assert.equal(window.__rbxportAddonWriteLease.owner,'playlist-sync');await assert.rejects(write(window),/Another add-on/);
  finish();await pending;assert.equal(window.__rbxportAddonWriteLease,undefined);assert.equal(additions,1);
});

test('UI transport attaches before optional library validation, with guarded validation still the default', async t => {
  t.mock.method(globalThis, 'fetch', async () => ({ ok: true, json: async () => [{ type: 'page', url: 'http://tauri.localhost/', webSocketDebuggerUrl: 'ws://127.0.0.1:43822/fixture' }] }));
  t.mock.property(globalThis, 'WebSocket', class {
    static OPEN = 1;
    readyState = 1;
    addEventListener(name, callback) { if (name === 'open') queueMicrotask(callback); }
    close() { this.readyState = 3; }
  });
  const bridge = new Bridge(); t.after(() => bridge.close());
  const commands = [];
  bridge.request = async method => { commands.push(method); return method === 'Page.getFrameTree' ? { frameTree: { frame: { id: 'main' } } } : {}; };
  bridge.call = async method => { commands.push(method); throw Error('Missing library API'); };
  assert.equal((await bridge.connect({ verifyLibrary: false })).attached, true);
  assert.deepEqual(commands, ['Page.getFrameTree', 'Runtime.enable']);
  assert.equal((await bridge.connect({ verifyLibrary: false })).attached, true);
  await assert.rejects(bridge.connect(), /Missing library API/);
  assert.deepEqual(commands, ['Page.getFrameTree', 'Runtime.enable', 'info']);
});
test('host actions are accepted only from the main rbxport page, not third-party or child frames', () => {
  const bridge = new Bridge(); bridge.mainFrameId = 'main';
  bridge.contexts.set(1, { origin: 'http://tauri.localhost', auxData: { frameId: 'main', isDefault: true } });
  bridge.contexts.set(2, { origin: 'https://report.rbxport.com', auxData: { frameId: 'child', isDefault: true } });
  bridge.contexts.set(3, { origin: 'http://tauri.localhost', auxData: { frameId: 'child', isDefault: true } });
  bridge.contexts.set(4, { origin: 'http://tauri.localhost', auxData: { frameId: 'main', isDefault: false } });
  assert.equal(bridge.acceptsHostContext(1), true);
  for (const id of [2,3,4,999]) assert.equal(bridge.acceptsHostContext(id), false);
});
test('popover and shared panel compile as self-contained scripts with serialized playlist data', () => {
  const model = { links: [{ name: "O'Brien </script>", playlistId: '1' }], expiresAt: Date.now() };
  assert.doesNotThrow(() => new Function(`return (${installHostUi.toString()})(${JSON.stringify(model)},${mountPanel.toString()},'',${fitPopover.toString()})`));
});

test('native updates reuse installed code and reinstall safely after the UI is removed',async()=>{
 const bridge=new Bridge(),expressions=[];bridge.mainFrameId='main';bridge.boundContext=1;
 bridge.contexts.set(1,{id:1,origin:'http://tauri.localhost',auxData:{frameId:'main',isDefault:true}});
 let removed=false;bridge.evaluate=async expression=>{expressions.push(expression);if(removed&&!expression.includes('function installHostUi')){removed=false;return{needsInstall:true};}return{installed:true};};
 const model={revision:1,links:[],rows:{},jobs:[]};
 await bridge.updateHost(model,'');await bridge.updateHost({...model,revision:2},'');
 assert(expressions[0].includes('function mountPanel'));assert(!expressions[1].includes('function mountPanel'));
 assert(expressions[1].length<expressions[0].length/10,'Progress updates do not resend the renderer, installer and stylesheet');
 removed=true;await bridge.updateHost({...model,revision:3},'');assert(expressions.at(-1).includes('function installHostUi'));
});
test('native command expressions compile with serialized untrusted arguments', async () => {
  const bridge = new Bridge();
  const expressions = [];
  bridge.socket = { readyState: WebSocket.OPEN, send(raw) {
    const message = JSON.parse(raw); const expression = message.params.expression;
    expressions.push(expression); const pending = bridge.pending.get(message.id);
    try { new Function('window', `return ${expression}`); pending.resolve(); } catch (error) { pending.reject(error); }
    clearTimeout(pending.timer); bridge.pending.delete(message.id);
  } };
  for (const method of ['info','open','page','track','create','import','add','analyse','reorder'])
    await bridge.call(method, { libraryId: 'test', name: "'); throw Error('injected'); //", ids: ['1'], expectedIds: ['1'] });
  assert.equal(expressions.length, 9);
  let reordered = false;
  const invoke = async (name, args) => {
    if (name === 'database_drives') return [{ current: true, masterDb: 'TEST' }];
    if (name === 'open_view') return { len: 1, viewId: 1 };
    if (name === 'view_ids_in_range') return ['1'];
    if (name === 'reorder_playlist') { reordered = true; assert.deepEqual(args.tracks, ['1']); }
  };
  await new Function('window', `return ${expressions.at(-1)}`)({ __TAURI_INTERNALS__: { invoke } });
  assert.equal(reordered, true);
  let wrote=false;
  const unsupported={__TAURI_INTERNALS__:{async invoke(name){if(name==='database_drives')throw 'Command database_drives not found';wrote=true;}}};
  await assert.rejects(new Function('window',`return ${expressions.at(-1)}`)(unsupported),/lacks the library API.*1\.9\.0/);
  assert.equal(wrote,false,'An unsupported host must fail before any library action');
});
