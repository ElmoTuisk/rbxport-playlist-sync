import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { firstRunSettings } from '../src/defaults.mjs';
import { run } from '../src/process.mjs';
test('installed tools and music folder configure themselves on first run', async t => {
  const root = await mkdtemp(join(tmpdir(), 'playlist-sync-defaults-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const tools = join(root, '.runtime', 'tools'); await mkdir(tools, { recursive: true });
  for (const filename of ['yt-dlp.exe', 'ffmpeg.exe', 'ffprobe.exe']) await writeFile(join(tools, filename), 'fixture');
  const defaults = firstRunSettings(join(root, 'data'), root);
  assert.equal(defaults.ffmpeg, join(tools, 'ffmpeg.exe'));
  assert.equal(defaults.ytdlp, join(tools, 'yt-dlp.exe'));
  assert.equal(defaults.musicFolder, join(root, 'data', 'Music'));
});
test('Windows launcher uses app mode, isolates its profile, validates pairing and preserves data paths', { skip: process.platform !== 'win32' }, async () => {
  const output = await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', fileURLToPath(new URL('./desktop.ps1', import.meta.url))]);
  assert.match(output, /Desktop launcher checks passed/);
});
