# Playlist Sync for rbxport

A small add-on for linking Spotify and SoundCloud playlists to your rbxport collection.

**Open it under Tag List on the left in rbxport.** A small panel shows each linked playlist, its status and a Sync button. Click a playlist name to see missing tracks. Settings live behind the gear. There are no dashboard pages or navigation tabs.

Experimental v0.10.3, tested with Windows x64 / rbxport 1.9.0 at host commit `7fb4dad3f88a2cc0cecec0e718b4dde408fd7448`.

New downloads include album artwork automatically: exact Spotify album images or SoundCloud track artwork, with an existing attached cover as fallback. Missing/broken artwork does not discard verified audio. MP3/AAC audio stays packet-preserved; no existing collection files are rewritten. Provider image downloads are limited to known HTTPS CDNs, 5 MiB per image and 15 seconds, with at most 8 MiB/32 entries cached. Images are normalized to a compatible JPEG attachment of at most 1200 pixels per side. See the README for the full behavior.

Source discovery checks ten initial results per SoundCloud/YouTube query, retains version names in its first query and lazily tries distinct alternate names. Bracketed featuring/with credits are normalized for discovery and identity checks; mix, duration and verified audio requirements remain in place. A library-only preview, an unprocessed queue item, a discovery match and a verified import are separate test outcomes.

## Install

1. Have [rbxport for Windows](https://github.com/chrisle/rbxport) installed.
2. Download `playlist-sync-0.10.3-windows-setup.zip` from [Releases](https://github.com/ElmoTuisk/rbxport-playlist-sync/releases/latest) and extract all files.
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

**Retry missing** retries held tracks across SoundCloud originals/search, Newgrounds and YouTube, then optional Soulseek. Provider failures, incomplete metadata and a bad first candidate no longer end discovery. **Resolve → Source attempts** distinguishes unavailable providers, wrong recordings, rejected audio and empty searches.

**Recheck files** scans your collection against the saved source list without downloading or changing the playlist. Equivalent comma/slash artist credits match automatically, while different mixes and durations still need review.

**Accept suggested matches** opens a bulk preview for existing-match reviews. It shows a count and collapsible list, excludes alternate lengths/versions by default, and offers an explicit checkbox to include those. **Accept N & reorder** links the accepted existing files and immediately places all known source songs in the last checked Spotify/SoundCloud order. Extra local songs remain at the bottom in their existing relative order. Missing files and tied choices remain for individual review. Current library/files, target membership and the preview signature are revalidated. The action performs no downloads, imports or deletions; no separate Sync is required. Normal Sync refreshes the online source and processes missing songs. Duplicate target memberships block the bulk operation. Stop or finish an active sync before accepting.

A first link performs a library/source preview, not a download batch. The status says Click Sync to search and download. Original-stream offers are available immediately without rerunning every provider. Preview-only sources show a specific notice and use a verified full recording length when public metadata exposes one.

**Official originals:** Artist-enabled SoundCloud download formats are tried first and accepted at their actual bitrate by default, including lower-quality originals. The Advanced setting can disable that exception. Ordinary stream copies still need separate confirmation. Original downloads can require SoundCloud sign-in/cookies. View official download opens the source page for sign-in or external gates. Full decoding, duration, identity, stereo and sample-rate checks remain in force.

**Check existing match** means a local candidate needs confirmation. **Check source** means acquisition needs attention. Resolve opens directly below that song, scrolls into view and shows the exact reason. Existing-match/retry/ignore choices are saved for Sync. Source URLs and selected files are inspected first; normal-quality choices start processing just that song. Lower-quality choices wait for separate approval. URLs, paths and drafts remain visible after errors and refreshes.

**Lower-quality alternatives available** appears beside songs awaiting a quality choice with codec, bitrate and reported/verified status; **Review quality** opens its choices. Active searches/transfers show current progress without a warning from older lower-quality alternatives. A transfer says **quality check pending** until verified; afterward its actual codec/bitrate is shown. Accepted exceptions still say **Lower-quality download approved**. The same status appears under All tracks, where completed normal downloads show the verified file quality.

**Lower-quality audio available** lists matching sources found during discovery or source inspection. Select a format, click **Review lower-quality file**, check the reported/verified codec, bitrate and source, then **Confirm & download**. Approval is for this song, URL and format only, with no global quality change. A changed codec or materially lower actual bitrate requires a fresh confirmation. MP3/AAC packets are preserved; Opus/Vorbis is decoded to FLAC for compatible playback and labelled with the original source quality, never described as a lossless original. Filenames, comments and playlist details mark the exception. Duration, full decoding, stereo, sample-rate and DRM rules remain enforced.

The whole rbxport collection is checked first, including files used in other playlists. SoundCloud uploader/label artist tags are handled separately from performer tags: a unique file can match when the complete normalized upload title is identical and contains the source performer credit, with matching duration and version. Bracketed featured credits and equivalent multi-artist lists are normalized without merging different mixes. Recheck files refreshes stale missing/source warnings without downloading or changing your playlist.

Reading a SoundCloud playlist does not require every track to offer playable audio. Protected/no-format entries remain in the complete metadata list for local matching and searches on other sources, rather than aborting the entire playlist. Actual DRM-protected sources are skipped and reported in Source attempts. Failed extraction, missing entries and count mismatches still reject the snapshot.

Example: source `B, A, C`; local `X, A, Y, B` → `B, A, C, X, Y` when all source tracks are available. The panel reports two retained extras. If C has no suitable source, the result is `B, A, X, Y` and C remains unresolved.

Automatic sync runs at the saved interval, normally hourly, while both processes run. Verified downloads, matches, jobs and run records survive restarts. Jobs held for quality review wait for your retry or a new source. History remains stored locally; the main panel deliberately shows only current status and issues.

## Optional Soulseek fallback

Open **gear → Soulseek fallback**, enter an existing Soulseek account, enable **Use as fallback on Sync**, and click **Save account**. Saving does not test sign-in; the first search does. If another Soulseek client is running, use a separate account to avoid disconnecting it.

Expand a playlist and click **Retry missing**. The add-on rechecks existing files and uses the last checked source list to queue unresolved recordings one at a time, checking web sources before Soulseek. Ordinary Sync can also fall back after a web source fails. Explicit file/URL choices remain authoritative, and ambiguous confident local matches still require your choice. Held Soulseek failures wait for an explicit batch retry.

The optional [Sockseek 3.0.6 helper](https://github.com/fiso64/sockseek) downloads automatically on first use; both its archive and executable are checked against pinned SHA-256 hashes. No extra app window is opened. The helper searches alternate artist/title variants and broader queries. Missing remote bitrate/sample-rate fields are allowed during discovery; the downloaded audio must pass the selected quality standard and original recording/duration checks. The add-on then probes and fully decodes the actual file before the existing import pipeline processes it. Progress and Cancel remain in the small panel. An unavailable recording remains in review while the batch continues; account or setup errors stop the batch. Temporary connection failures back off peer searches for 60 seconds while later songs continue. Peer queues and availability affect completion. A rejected peer file can be followed by a different peer. Searches and transfers have bounded retries and timeouts.

Soulseek credentials use Windows CurrentUser DPAPI encryption and are excluded from API models, logs and process arguments. The helper requires a temporary local plaintext config while it runs; this is removed afterward and cleaned on startup after interruption. Incoming connections are off by default. The optional **Allow incoming peer connections** checkbox opens a temporary TCP 49998 listener while the helper runs; it does not change firewall/router settings or share music folders. The helper retains its AGPL-3.0 license and is downloaded separately, not bundled in the add-on ZIP. See the validation record for synthetic and live peer-transfer checks.

## Audio standard

The default audio standard produces **320 kbps MP3** from a 320 kbps MP3 or lossless source. A qualifying MP3 is copied without re-encoding; lossless input is converted with FFmpeg. **gear → Audio standard → Also allow AAC 256 kbps or higher** additionally accepts qualifying AAC and preserves its audio as `.m4a` without lossy conversion. The choice is saved; strict MP3/lossless remains the default for new installations.

Checks include stereo audio, at least 44.1 kHz, exactly one audio stream, full decoding and independent decoded duration. Duration tolerance is max(3 seconds, min(8 seconds, 2% of source duration)). Candidate discovery also compares artist/title/version and rejects previews, compilations and live streams.

AAC below the selected threshold, Opus and lower-bitrate MP3 do not become better by encoding them to 320 kbps. Automatic sync holds those sources for review; you can explicitly approve one song as described above. A manual URL does not bypass duration or file checks. If no usable recording is available, supply an original or purchased file.

Format checks cannot prove a recording's historical quality: previously upscaled files or lossy audio stored as FLAC can evade them. Existing collection files are reused and are not certified or replaced by this release. Only acquire audio you are entitled to download.

## Spotify and SoundCloud

Public SoundCloud playlist links work through yt-dlp when the content is publicly available. An authorized original download may need your own exported cookies file; add it under Settings → Advanced. The add-on never exports browser cookies automatically.

Spotify can fall back to a public page only when its total count and pagination state prove the track list is complete. Truncated previews never replace a saved snapshot. For large/private playlists or pages without a complete snapshot, Spotify needs a personal application from the [developer dashboard](https://developer.spotify.com/dashboard). In Settings → Connect Spotify, enter its Client ID. Register this exact redirect URI: `http://127.0.0.1:43821/oauth/spotify`. Authentication uses PKCE and read-only playlist scopes; no client secret is needed. Development-mode/account restrictions apply; see [Spotify's migration guide](https://developer.spotify.com/documentation/web-api/tutorials/february-2026-migration-guide).

Start sign-in with **Connect** in the panel. The redirect URI is an address to register in the Spotify developer dashboard, not a sign-in link to open directly. The panel remembers the Client ID and shows waiting/connected status. Pending sign-in attempts are encrypted for the current Windows account and survive service restarts for up to ten minutes. Expired, incomplete and cancelled callbacks show a useful result page; refreshing a completed callback does not exchange the code again. A previously lost attempt cannot be recovered retroactively: start a fresh Connect attempt.

Spotify supplies metadata. Audio discovery uses the multi-source pipeline and selected audio standard. Live Spotify account authentication is not yet verified because no test Client ID/account was supplied. Rate/access failures do not empty a local playlist.

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


## Bulk lower-quality approval and deleted playlists

Expand a link and use Accept lower quality… → View N songs and quality → Accept N & download. One confirmation approves the exact listed choices, at the highest reported bitrate among existing options, and starts a serial download/import queue. Unknown bitrate, preview/wrong-length options, cancelled jobs and existing-match reviews are excluded. Global audio settings stay unchanged. The queue continues after individual failures, preserves source order and retains extra songs; cancellation keeps unstarted approvals queued.

Deleting a target in rbxport automatically removes its link, rows and playlist-specific history after a successful current-library check. An active operation is cancelled and allowed to finish before cleanup. Audio and reusable collection bindings remain. Switching libraries does not unlink the hidden library’s playlists.

rbxport updates do not overwrite the separate add-on installation or data. Close rbxport after updating and reopen through Playlist Sync. Version 1.9.0 is the tested host; changes to automation commands or sidebar structure may require an add-on update.
