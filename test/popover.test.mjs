import test from 'node:test';
import assert from 'node:assert/strict';
import { fitPopover } from '../src/host-ui.mjs';

test('expanding a panel near the bottom moves it upward to keep its buttons on screen', () => {
  const viewport = { width: 1200, height: 800 }, anchor = { right: 70, top: 620 };
  const compact = fitPopover(viewport, anchor, { width: 390, height: 160 });
  const expanded = fitPopover(viewport, anchor, { width: 390, height: 650 });
  assert.equal(compact.top, 620);
  assert.ok(expanded.top < compact.top);
  assert.ok(expanded.top + 650 <= 788);
});

test('content taller than the window gets a bounded scroll area', () => {
  const layout = fitPopover({ width: 800, height: 400 }, { right: 70, top: 350 }, { width: 390, height: 1800 });
  assert.equal(layout.top, 12);
  assert.equal(layout.maxHeight, 376);
  assert.ok(layout.top + layout.maxHeight <= 388);
});

test('small and offset viewports keep both panel edges in the visible area', () => {
  const viewport = { left: 20, top: 40, width: 320, height: 300 };
  const layout = fitPopover(viewport, { right: 330, top: 320 }, { width: 390, height: 800 });
  assert.equal(layout.left, 32);
  assert.equal(layout.top, 52);
  assert.equal(layout.maxWidth, 296);
  assert.equal(layout.maxHeight, 276);
});
