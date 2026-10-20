import test from 'node:test';
import assert from 'node:assert/strict';
import {runInNewContext} from 'node:vm';
import {installHostUi,fitPopover} from '../src/host-ui.mjs';

test('hidden native panels and unchanged heartbeats skip rendering, and unrelated app mutations skip sidebar work',()=>{
 const callbacks=[],frames=[],calls={updates:0},window={innerWidth:1200,innerHeight:800,addEventListener(){},removeEventListener(){}};
 const element=()=>({style:{},children:[],hidden:false,setAttribute(){},addEventListener(){},append(...items){this.children.push(...items);},remove(){},contains(target){return target===this;},querySelector(){return null;},getClientRects(){return [{}];},getBoundingClientRect(){return{right:70,top:350};}});
 const document={adoptedStyleSheets:[],body:element(),createElement:element,querySelector(){return null;},querySelectorAll(){return[];},addEventListener(){},removeEventListener(){}};
 const run=runInNewContext(`(${installHostUi.toString()})`,{window,document,URL,CSSStyleSheet:class{replaceSync(){}},MutationObserver:class{constructor(fn){callbacks.push(fn);}observe(){}disconnect(){}},ResizeObserver:class{observe(){}disconnect(){}},requestAnimationFrame:fn=>{frames.push(fn);return frames.length;},cancelAnimationFrame(){},setInterval(){return 1;},clearInterval(){},setTimeout,clearTimeout});
 const mount=()=>({update(){calls.updates++;},collapse(){},showError(){}});
 const installed=run({revision:1,links:[],playlists:[],expiresAt:Date.now()+60000},mount,'',fitPopover);
 assert.equal(installed.installed,true);assert.equal(installed.ready,false,'An injected panel without a sidebar anchor is not ready');
 const host=window.__rbxportPlaylistSync;
 host.update({revision:2,links:[],playlists:[]});assert.equal(calls.updates,0);
 host.open();assert.equal(calls.updates,1);
 host.update({revision:2,links:[],playlists:[]});assert.equal(calls.updates,1);
 host.update({revision:3,links:[],playlists:[]});assert.equal(calls.updates,2);
 const before=frames.length;
 callbacks[0]([{target:{closest(){return null;}},addedNodes:[],removedNodes:[]}]);assert.equal(frames.length,before);
 callbacks[0]([{target:{closest(){return {}; }},addedNodes:[],removedNodes:[]}]);assert.equal(frames.length,before+1);
 const anchor={className:'sidebar',querySelector(){return null;},parentElement:{after(button){button.isConnected=true;this.nextElementSibling=button;document.toolbar=button;}}};
 document.querySelector=selector=>selector.includes('Tag List')?anchor:selector==='#playlist-sync-button'?document.toolbar:null;
 const loaded={revision:4,links:[],playlists:[]};host.update(loaded);
 assert.equal(run(loaded,mount,'',fitPopover).ready,true,'The attached visible button marks startup ready');
 document.toolbar.isConnected=false;
 assert.equal(run(loaded,mount,'',fitPopover).ready,false,'A detached button must not report successful startup');
 host.dispose();
});
