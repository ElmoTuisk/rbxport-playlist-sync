import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export function firstRunSettings(dataDir, root = fileURLToPath(new URL('../', import.meta.url))) {
  const tools = join(root, '.runtime', 'tools');
  const result = { musicFolder: join(dataDir, 'Music'), autoAnalyse: true };
  for (const [setting, filename] of [['ytdlp', 'yt-dlp.exe'], ['ffmpeg', 'ffmpeg.exe'], ['ffprobe', 'ffprobe.exe']]) {
    const path = join(tools, filename);
    if (existsSync(path)) result[setting] = path;
  }
  return result;
}
