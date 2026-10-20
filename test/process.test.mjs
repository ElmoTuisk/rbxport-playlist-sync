import test from 'node:test';
import assert from 'node:assert/strict';
import {run} from '../src/process.mjs';

test('streaming tools preserve split UTF-8 and deliver a final line without retaining duplicate stdout',async()=>{
  const lines=[];
  const script=`const data=Buffer.from('{"artist":"Málaga"}');const cut=data.indexOf(0xc3)+1;process.stdout.write(data.subarray(0,cut));setTimeout(()=>process.stdout.write(data.subarray(cut)),30);`;
  const output=await run(process.execPath,['-e',script],{collectStdout:false,onLine:line=>lines.push(JSON.parse(line))});
  assert.equal(output,'');assert.deepEqual(lines,[{artist:'Málaga'}]);
  assert.equal(await run(process.execPath,['-e',"process.stdout.write('ordinary output')"]),'ordinary output');
});

test('streamed tools still enforce output limits and propagate parser errors safely',async()=>{
  await assert.rejects(run(process.execPath,['-e',"process.stdout.write('x'.repeat(4096))"],{collectStdout:false,maxBytes:128,onLine(){}}),/exceeded size limit/);
  await assert.rejects(run(process.execPath,['-e',"console.log('not json');setInterval(()=>{},1000)"],{collectStdout:false,onLine:line=>JSON.parse(line)}),SyntaxError);
});

test('cancelling a streaming process terminates it without waiting for its normal exit',async()=>{
  const controller=new AbortController();
  await assert.rejects(run(process.execPath,['-e',"console.log('started');setInterval(()=>{},1000)"],{signal:controller.signal,collectStdout:false,onLine:()=>controller.abort()}),/Cancelled/);
});
