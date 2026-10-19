import test from 'node:test';
import assert from 'node:assert/strict';
import { Bridge } from '../src/bridge.mjs';
import { installHostUi, fitPopover } from '../src/host-ui.mjs';
import { mountPanel } from '../public/panel.mjs';
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
});
