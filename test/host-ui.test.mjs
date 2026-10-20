import test from 'node:test';
import assert from 'node:assert/strict';
import {runInNewContext} from 'node:vm';
import {installHostUi,fitPopover} from '../src/host-ui.mjs';

test('hidden native panels and unchanged heartbeats skip rendering, and unrelated app mutations skip sidebar work',()=>{
 const callbacks=[],frames=[],calls={updates:0},window={innerWidth:1200,innerHeight:800,addEventListener(){},removeEventListener(){}};
 const element=()=>({style:{},children:[],hidden:false,setAttribute(){},addEventListener(){},append(...items){this.children.push(...items);},remove(){},contains(target){return target===this;},querySelector(){return null;},getBoundingClientRect(){return{right:70,top:350};}});
 const document={adoptedStyleSheets:[],body:element(),createElement:element,querySelector(){return null;},querySelectorAll(){return[];},addEventListener(){},removeEventListener(){}};
 const run=runInNewContext(`(${installHostUi.toString()})`,{window,document,URL,CSSStyleSheet:class{replaceSync(){}},MutationObserver:class{constructor(fn){callbacks.push(fn);}observe(){}disconnect(){}},ResizeObserver:class{observe(){}disconnect(){}},requestAnimationFrame:fn=>{frames.push(fn);return frames.length;},cancelAnimationFrame(){},setInterval(){return 1;},clearInterval(){},setTimeout,clearTimeout});
 const mount=()=>({update(){calls.updates++;},collapse(){},showError(){}});
 run({revision:1,links:[],playlists:[],expiresAt:Date.now()+60000},mount,'',fitPopover);
 const host=window.__rbxportPlaylistSync;
 host.update({revision:2,links:[],playlists:[]});assert.equal(calls.updates,0);
 host.open();assert.equal(calls.updates,1);
 host.update({revision:2,links:[],playlists:[]});assert.equal(calls.updates,1);
 host.update({revision:3,links:[],playlists:[]});assert.equal(calls.updates,2);
 const before=frames.length;
 callbacks[0]([{target:{closest(){return null;}},addedNodes:[],removedNodes:[]}]);assert.equal(frames.length,before);
 callbacks[0]([{target:{closest(){return {}; }},addedNodes:[],removedNodes:[]}]);assert.equal(frames.length,before+1);
 host.dispose();
});
