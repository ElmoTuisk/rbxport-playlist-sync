# Playlist Sync for rbxport

A small add-on for linking Spotify and SoundCloud playlists to your rbxport collection.

**Open it under Tag List on the left in rbxport.** A small panel shows each linked playlist, its status and a Sync button. Click a playlist name to see missing tracks. Settings live behind the gear. There are no dashboard pages or navigation tabs.

Experimental v0.3.3, tested with Windows x64 / rbxport 1.9.0 at host commit `7fb4dad3f88a2cc0cecec0e718b4dde408fd7448`.

## Install

1. Have [rbxport for Windows](https://github.com/chrisle/rbxport) installed.
2. Download `playlist-sync-0.3.3-windows-setup.zip` and extract all files.
3. Double-click **Install-Playlist-Sync.cmd**. Setup downloads and verifies a private Node runtime, yt-dlp and FFmpeg/FFprobe. No administrator access, developer tools or PATH configuration is needed. Internet access is required for setup.
4. Close rbxport normally before the first launch, then use the **Playlist Sync** Desktop or Start Menu shortcut. It starts rbxport with the add-on connection enabled.
5. In rbxport, open **Playlist sync**, directly below **Tag List** on the left. Link a playlist, then sync.

Start rbxport through this shortcut when you want the add-on loaded. An already running rbxport instance without its local automation connection must be closed normally first. The add-on does not install a Windows login task.

The panel closes with ×, Escape or a click outside it. Background sync continues while the service and rbxport are running. Use **Start Menu → Playlist Sync → Stop Playlist Sync** to stop it completely. Restart rbxport normally to turn off its local automation port.

## The playlist symbol

Linked playlists have a small **⇄** beside their names in rbxport. Click the symbol to open their sync details.

- Muted green: synced successfully.
- Muted amber: linked, with tracks or errors needing attention.
- Blue: syncing.
- Grey: linked and waiting for a check.

These are display annotations. Playlist names and exported names are not modified. Badges follow visible rows when you scroll. The adapter uses the host's playlist ID when available; in read-only views it falls back only to an exact name that is unique in the current library. Ambiguous duplicate names receive no guessed badge.

## What sync does

The add-on scans your collection before downloading anything. It checks that matched files exist, compares artist/title/mix/duration, prefers a confident match already in the target, and remembers your decisions. One source can be linked to each regular target playlist; a new target can also be created.

A first link creates a read-only preview automatically. Sync reuses existing collection files, acquires suitable missing tracks, imports through rbxport, and optionally analyzes new tracks. Click a linked playlist name to reveal missing tracks, Auto-sync and the retained-extras notice. All tracks are available in a collapsed detail list. Source/file overrides, saved matches, retry and ignore are available under Resolve.

Resolved source tracks come first in source order. Extra local songs stay at the bottom in their original relative order. Source removals never delete files or local playlist entries. Unavailable source tracks have no placeholder in the local playlist; their status stays visible in the panel.

**Check source** means a track needs review because matching or download checks could not approve it. Resolve opens directly below that song, scrolls into view and shows the exact reason. Choose a file, an existing collection track, another source URL, retry or ignore; save, then Sync to process the choice. A manual source does not bypass quality checks.

Example: source `B, A, C`; local `X, A, Y, B` → `B, A, C, X, Y` when all source tracks are available. The panel reports two retained extras. If C has no suitable source, the result is `B, A, X, Y` and C remains unresolved.

Automatic sync runs at the saved interval, normally hourly, while both processes run. Verified downloads, matches, jobs and run records survive restarts. Jobs held for quality review wait for your retry or a new source. History remains stored locally; the main panel deliberately shows only current status and issues.

## Audio standard

New downloads must become **320 kbps MP3**, using a source encoded as approximately 320 kbps MP3 or lossless audio. A qualifying MP3's audio is copied without re-encoding; lossless input is converted with FFmpeg.

Checks include stereo audio, at least 44.1 kHz, exactly one audio stream, full decoding and independent decoded duration. Duration tolerance is max(3 seconds, min(8 seconds, 2% of source duration)). Candidate discovery also compares artist/title/version and rejects previews, compilations and live streams.

AAC, Opus and lower-bitrate MP3 sources do not become better by encoding them to 320 kbps, so they are rejected. YouTube sources often fail this strict requirement. A manual URL does not bypass duration or audio checks. Supply an original or purchased file when no qualifying source is available.

Format checks cannot prove a recording's historical quality: previously upscaled files or lossy audio stored as FLAC can evade them. Existing collection files are reused and are not certified or replaced by this release. Only acquire audio you are entitled to download.

## Spotify and SoundCloud

Public SoundCloud playlist links work through yt-dlp when the content is publicly available. An authorized original download may need your own exported cookies file; add it under Settings → Advanced. The add-on never exports browser cookies automatically.

Spotify needs a personal application from the [developer dashboard](https://developer.spotify.com/dashboard). In Settings → Connect Spotify, enter its Client ID. Register this exact redirect URI: `http://127.0.0.1:43821/oauth/spotify`. Authentication uses PKCE and read-only playlist scopes; no client secret is needed. Development-mode/account restrictions apply; see [Spotify's migration guide](https://developer.spotify.com/documentation/web-api/tutorials/february-2026-migration-guide).

Start sign-in with **Connect** in the panel. The redirect URI is an address to register in the Spotify developer dashboard, not a sign-in link to open directly. The panel remembers the Client ID and shows waiting/connected status. Pending sign-in attempts are encrypted for the current Windows account and survive service restarts for up to ten minutes. Expired, incomplete and cancelled callbacks show a useful result page; refreshing a completed callback does not exchange the code again. A previously lost attempt cannot be recovered retroactively: start a fresh Connect attempt.

Spotify supplies metadata. Audio discovery uses YouTube through yt-dlp and still applies the strict source-quality requirement. Live Spotify account authentication is not yet verified because no test Client ID/account was supplied. Rate/access failures do not empty a local playlist.

## How it integrates

rbxport has no public plugin loader. This add-on uses its existing Windows `RBXPORT_DEVTOOLS_PORT` automation option to add a small view in the running app and to call existing guarded native commands. There is no host rebuild or direct `master.db` access. The adapter is specific to the tested host version and may need updating after a rbxport release.

The native panel uses a scoped stylesheet and a local runtime binding restricted to the main rbxport page. It does not change the host's content security policy or frame network permissions. The entry and symbols are reapplied after UI changes; clean shutdown removes them. Unexpected disconnects expire the annotations after a short timeout.

rbxport's local automation port, `43822`, gives local programs powerful app access. Keep it local and do not forward it. Normal rbxport write protection remains authoritative. The fallback HTTP service binds to `127.0.0.1:43821`, requires a fresh pairing token, and rejects unexpected Host/Origin values.

## Files, updates and recovery

Installed app/runtime files: `%LOCALAPPDATA%\Programs\rbxport-playlist-sync`.

Settings, jobs, mappings, credentials, logs and Music folder: `%LOCALAPPDATA%\rbxport-playlist-sync`. Data is kept separate from app files and preserved when setup runs again. Stop the service before updating. Spotify credentials use Windows CurrentUser DPAPI encryption. Keep this data folder private.

Sync is not one transaction across a provider, audio files and rbxport. Durable checkpoints let import/analysis retries reuse a verified file. Partial source responses preserve the previous snapshot. Current library identity is checked; an order comparison protects against many concurrent target edits. Avoid manually rearranging the playlist during sync.

Before/after order IDs are journaled locally. This version has no order-restore screen. Repeated local memberships are retained, but an order change is refused when rbxport cannot safely distinguish repeated occurrences. Files and existing playlist entries are never automatically deleted.

## Development and distribution

```powershell
node --test test/*.test.mjs
node src/server.mjs --demo --data-dir .local-data/demo
```

Demo data is fictional and read-only. Open the pairing URL from that data folder's `launch-url.txt`. FFmpeg/FFprobe are needed for the real-audio test; it skips explicitly if absent. Override their paths with `FFMPEG` and `FFPROBE`.

Portable source runs use `.local-data`. `Start-Playlist-Sync.ps1 -NodePath ... -RbxportPath ...` supports custom installations. `-NoWindow` starts the service quietly. `-Detached` opens a small 430 × 500 fallback window instead of the native popover; Edge or Chrome is needed only for that optional mode.

This folder can be its own GitHub repository. `Package-Addon.ps1` makes an allowlisted Windows setup ZIP, excluding private state, downloaded tools, installed runtimes and caches. Nothing is published automatically. See [architecture](architecture.md), [validation](validation.md) and [release checklist](releasing.md).

## License

GPL-2.0-or-later; see [LICENSE](../LICENSE). Built for [rbxport](https://github.com/chrisle/rbxport). The [spotDL](https://github.com/spotDL/spotify-downloader) and [scdl](https://github.com/scdl-org/scdl) projects informed downloader evaluation. This implementation calls yt-dlp and FFmpeg directly to keep pre-transcode quality checks explicit. The tools retain their own licenses. This is an independent add-on.

