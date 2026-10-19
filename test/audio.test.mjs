import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile, readFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { Downloads } from '../src/downloads.mjs';
import { run } from '../src/process.mjs';
const tools = fileURLToPath(new URL('../.tools/', import.meta.url));
const ffmpeg = process.env.FFMPEG || (existsSync(join(tools, 'ffmpeg.exe')) ? join(tools, 'ffmpeg.exe') : 'ffmpeg');
const ffprobe = process.env.FFPROBE || (existsSync(join(tools, 'ffprobe.exe')) ? join(tools, 'ffprobe.exe') : 'ffprobe');
const available = spawnSync(ffmpeg, ['-version'], { windowsHide: true }).status === 0 && spawnSync(ffprobe, ['-version'], { windowsHide: true }).status === 0;
test('real audio: accept 320 MP3/lossless, reject 128 MP3 and truncated audio, never overwrite published files', { skip: !available }, async t => {
  const dir = await mkdtemp(join(tmpdir(), 'playlist-sync-audio-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const downloads = new Downloads(() => ({ ffmpeg, ffprobe, musicFolder: dir }));
  const track = { key: 'test:1', title: 'Synthetic test', artist: 'Fixture', duration: 10 };
  for (const [name, args] of [['low.mp3', ['-c:a', 'libmp3lame', '-b:a', '128k']], ['high.mp3', ['-c:a', 'libmp3lame', '-b:a', '320k']], ['lossless.flac', ['-c:a', 'flac']]])
    await run(ffmpeg, ['-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=10', '-ar', '44100', '-ac', '2', ...args, join(dir, name)]);
  await assert.rejects(downloads.verify(join(dir, 'low.mp3'), track), /Quality check/);
  assert.equal((await downloads.verify(join(dir, 'high.mp3'), track, undefined, true)).bitrate, 320);
  const signal = new AbortController().signal;
  const output = await downloads.acquire(track, { id: 'job', sourcePath: join(dir, 'lossless.flac') }, () => {}, signal);
  assert.equal(output.quality.bitrate, 320);
  const before = await readFile(output.file), stamp = (await stat(output.file)).mtimeMs;
  await downloads.acquire(track, { id: 'job', sourcePath: join(dir, 'lossless.flac') }, () => {}, signal);
  assert.deepEqual(await readFile(output.file), before); assert.equal((await stat(output.file)).mtimeMs, stamp);
  const bytes = await readFile(join(dir, 'high.mp3')); await writeFile(join(dir, 'broken.mp3'), bytes.subarray(0, Math.floor(bytes.length / 4)));
  await assert.rejects(downloads.verify(join(dir, 'broken.mp3'), track));
});

test('real AAC is preserved as M4A only with explicit policy; low AAC and 256 MP3 still fail', {skip:!available},async t=>{
 const dir=await mkdtemp(join(tmpdir(),'playlist-sync-aac-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const high=join(dir,'high.m4a'),low=join(dir,'low.m4a'),mp3=join(dir,'low.mp3');
 for(const [path,codec,rate]of [[high,'aac','288k'],[low,'aac','128k'],[mp3,'libmp3lame','256k']])await run(ffmpeg,['-v','error','-f','lavfi','-i','anoisesrc=color=white:duration=10:sample_rate=44100:seed=1[a];anoisesrc=color=white:duration=10:sample_rate=44100:seed=2[b];[a][b]amerge=inputs=2','-ac','2','-c:a',codec,'-b:a',rate,path]);
 const track={key:'aac:fixture',title:'Synthetic AAC',artist:'Fixture',duration:10};
 const strict=new Downloads(()=>({ffmpeg,ffprobe,musicFolder:dir}));await assert.rejects(strict.verify(high,track),/Quality check/);
 const club=new Downloads(()=>({ffmpeg,ffprobe,musicFolder:dir,quality:'club-aac-256'}));
 for(const path of [low,mp3])await assert.rejects(club.verify(path,track),/Quality check/);
 const result=await club.acquire(track,{id:'aac-job',sourcePath:high},()=>{},new AbortController().signal);
 assert.match(result.file,/\.m4a$/);assert.equal(result.quality.codec,'aac');assert(result.quality.bitrate>=255);
 const original=await run(ffmpeg,['-v','error','-i',high,'-map','0:a:0','-c:a','copy','-f','hash','-hash','sha256','-']);
 const published=await run(ffmpeg,['-v','error','-i',result.file,'-map','0:a:0','-c:a','copy','-f','hash','-hash','sha256','-']);
 assert.equal(published,original,'AAC packets must be copied without lossy re-encoding');
});
