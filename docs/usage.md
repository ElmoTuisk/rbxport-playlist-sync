# Detailed usage guide

[Back to the overview](../README.md) · [Architecture and development](addon-guide.md)

Setup, playlist actions, audio policies and troubleshooting in detail.

## Install

1. Install [rbxport for Windows](https://github.com/chrisle/rbxport/releases/latest).
2. From **[Releases](https://github.com/ElmoTuisk/rbxport-playlist-sync/releases/latest)**, download **`playlist-sync-0.11.3-windows-setup.exe`**.
3. Close rbxport, then open the EXE and click **Install / Update**.
4. Setup downloads verified tools and creates shortcuts. Internet is required; administrator access and a separate Node installation are not.
5. Leave **Show Playlist Sync when rbxport opens** checked to enable automatic attachment. Open compatible rbxport from its standard Start Menu or Desktop shortcut. Without automatic attachment, use the Playlist Sync shortcut.
6. In rbxport, click **Playlist sync**, directly below **Tag List** on the left.

For automatic attachment, run `Configure-Rbxport-Startup.ps1` from each installed add-on folder. The original rbxport shortcuts then start both enabled add-ons through one shared launcher. Closing rbxport stops both services and cancels their current work. Conventional separate add-on and Windows sign-in shortcuts are removed. Services, saved data and pairing remain independent. Installer automation can pass `-StartWithRbxport`.

To disable automatic attachment, run `powershell -NoProfile -ExecutionPolicy Bypass -File "<installed folder>\Configure-Rbxport-Startup.ps1" -Disable`. The other enabled add-on keeps its shared launcher. Disabling the last restores unchanged original rbxport shortcuts; user-modified shortcuts are retained. Close rbxport to stop the current Sync session. Other add-on registrations remain enabled. Disabling the last restores the previous user connection setting. There is no automatic updater.

Without automatic attachment, use the **Playlist Sync** Desktop or Start Menu shortcut. If rbxport is already open without its local connection, close it normally first.

The sidebar entry is attached by the running add-on. The launcher checks that the button is visible before reporting success. Opening the executable directly, a custom shortcut or the separate older Store entry bypasses the configured launcher. The older Store build 0.19.3 lacks the required library API; use the compatible standalone installation if both versions are present. Only rbxport 1.9.0 has been tested end to end; package discovery is not proof of compatibility with later releases.

The sidebar now attaches even when the library compatibility check fails. Its popup explains the problem and pauses library actions instead of disappearing. Saved links stay intact, and a successful reconnect restores the controls. This does not add syncing support to an incompatible host.

After a successful reconnect to the same library, old playlist errors about the missing `database_drives` command are replaced with **Connection restored · Recheck files or Sync**. The old failure remains in history. A reconnect alone does not recheck songs; **Recheck files** refreshes saved song matches without downloads or playlist writes.

## Link your first playlist

1. Copy a public SoundCloud or Spotify playlist URL. Spotify account setup is below if needed.
2. Open **Playlist sync → + Link playlist**.
3. Paste the URL and choose an existing rbxport playlist, or select **Create new…**. Save.
4. The add-on previews the link without importing or rearranging songs. Click the playlist name to inspect it, then press **Sync** when ready. rbxport must allow library writes.
5. Enable **Auto-sync** in the playlist details for hourly checks while rbxport and the add-on are running.

Available source songs go first, in source order. Extra local songs stay at the bottom in their original relative order, with a notice. Sync never automatically deletes your audio files or existing playlist entries.

A small **⇄** beside a linked playlist opens its details: green means synced, amber needs attention, blue is syncing, and grey is waiting for a check. Closing the panel keeps background sync running.

## Background performance

Searches stream fully extracted metadata instead of waiting for all ten results before checking the first. Primary SoundCloud and YouTube metadata requests overlap, with at most two discovery providers active. Selection still follows the existing source order, artist-enabled originals remain first and alternate names stay lazy. Completed downloads, file validation and imports remain serial. A faster background result cannot override a preferred source. Unused searches are cancelled; a failed background search gets a fresh attempt at its normal turn. Source playlist snapshots still require a complete read.

The add-on skips hidden/unchanged panel renders, builds All tracks only when expanded, reuses its installed UI code, coalesces progress updates and avoids redundant playlist-add commands. Original metadata is cached for five minutes in a bounded cache; public SoundCloud hints expire after ten minutes. Downloads and audio analysis still do work while active.

## Spotify setup (optional)

Public SoundCloud playlists usually need no sign-in. For Spotify, the add-on first uses your connected account. If access is denied or no account is connected, it can read a public page only when that page proves the entire track list is present. Partial pages, embeds, rate limits and incomplete API responses never replace a saved snapshot. Large/private playlists may require your own developer app and an eligible owner/collaborator account.

1. Create an app in the [Spotify developer dashboard](https://developer.spotify.com/dashboard) with Web API access.
2. Register this exact redirect URI in the app settings and save it:

   ```text
   http://127.0.0.1:43821/oauth/spotify
   ```

3. Copy its **Client ID**. No client secret is needed.
4. In the add-on, open **gear → Connect Spotify**, paste the Client ID and click **Connect**.
5. Finish authorization in your browser, then check for **Spotify connected** in the panel.

Start sign-in with **Connect**; opening the redirect address directly does not sign you in. For an expired attempt, click Connect again. Spotify’s [development-mode restrictions](https://developer.spotify.com/documentation/web-api/tutorials/february-2026-migration-guide) apply. Live Spotify account authorization still needs a full integration test.

## Accept existing matches in bulk

1. Stop/wait for any active sync, then expand the linked playlist.
2. Click **Accept suggested matches**. Review the count and optional **View suggestions** list.
3. By default, different lengths and versions are excluded. Enable **Include different lengths or versions** if you want to use your local extended/alternate recordings; their source/local durations are shown.
4. Click **Accept N & reorder** once. The add-on rechecks existing files and the open library, links the accepted files, and immediately orders all known source songs like Spotify/SoundCloud. Extra local songs stay at the bottom in their previous relative order.

Tied candidates and missing files remain for individual review. A unique eligible file already in the target playlist is preferred. This action uses the last checked source order and performs no downloads, imports or deletions. Normal **Sync** refreshes the online source and processes missing songs. Changed suggestions or playlist membership invalidate an old confirmation. If the playlist contains duplicate memberships, bulk ordering stops and asks you to remove those duplicates first.

## SoundCloud official downloads

Sync tries the artist-enabled **Download original file** format before stream copies. By default it accepts the original bitrate even when below your normal standard, preserves the audio without upscaling, and marks lower-quality originals with **LOWER**, codec and bitrate. You can turn this off under **gear → Advanced → Accept artist-enabled official downloads at their original quality**. Recording identity, length, complete decoding, stereo and sample-rate checks still apply.

SoundCloud may require sign-in for its original downloads. If an artist-enabled original is unavailable to the current session, the add-on reports that requirement and continues other sources. Supply your own SoundCloud cookies file under Advanced when needed. **View official download** opens the original SoundCloud page for sign-in or external artist download steps; gates are not submitted automatically. A “free download” title alone is not proof that an original file is accessible.

Ordinary lower-quality SoundCloud/YouTube streams still require the separate confirmation below. Preview-only formats are never treated as complete songs. Full recording lengths are read from matching public SoundCloud metadata when available, so a 30-second preview does not incorrectly reject a full-length alternative.

## Missing songs / “Check source”

Searches check ten initial SoundCloud/YouTube results and try distinct alternate names if needed. The first query retains remix/version labels; a broader query is only a discovery hint. Bracketed Spotify `(with …)`/featured credits do not have to appear in an upload title. Recording identity, version, duration and actual file checks still apply to every candidate. A familiar song can still lack an accessible file at your chosen quality; converting a lower stream to 320 kbps does not qualify it.

A temporary Soulseek connection error leaves that song for retry and lets the batch continue with other songs. Peer searches back off for one minute after a connection failure. Authentication/setup errors still stop with a clear message so the queue does not repeatedly use a broken account/helper.

Linking initially checks the source and your collection; it does not download music. The status explicitly says **Click Sync to search and download**. Available original-stream choices appear immediately, labelled **Lower-quality original stream available** until a complete search has run. **Sync** searches other sources at your usual audio standard.

## Embedded album covers

New downloads automatically embed the exact Spotify track's album cover or the SoundCloud track artwork. Album names are retained when supplied by the playlist. Old saved Spotify snapshots can resolve the exact track's cover with the public [Spotify oEmbed API](https://developer.spotify.com/documentation/embeds/reference/oembed); another Spotify connection is not required for that lookup.

If provider artwork is unavailable, the add-on preserves an existing attached cover in the downloaded file. It does not substitute an arbitrary YouTube video frame. MP3 and AAC audio packets are copied unchanged; artwork also works in the approved FLAC playback output. Image retrieval has size/time limits and a bounded cache. A missing or broken image keeps the verified audio and records **cover unavailable**. Existing collection files are not rewritten; this applies to newly published downloads.

### Accept lower-quality songs in bulk

1. Expand the linked playlist and click **Accept lower quality…**.
2. Check the count and optional **View N songs and quality** list. The add-on chooses the highest reported bitrate among each song’s existing options; this is not a comparison of perceived quality across codecs.
3. Click **Accept N & download** once. Only the listed song/source/format choices are approved and queued. Downloads run one at a time, continue after individual failures, and apply source order with extra songs retained at the bottom. Your global audio standard stays unchanged.

Unknown bitrate, preview formats, wrong lengths, cancelled songs and existing-match reviews remain for individual handling. A changed preview requires a fresh confirmation. Cancelling a download batch keeps unstarted approved songs queued for a later Sync. Actual audio that changes codec or falls materially below the approved bitrate still needs a new confirmation.

### Choose lower-quality audio for one song

1. Songs awaiting a quality choice show **Lower-quality alternatives available** with codec/bitrate directly in the list. Click **Review quality**, choose a format under **Lower-quality audio available**, then **Review lower-quality file**. During an active search/download, the row shows its current progress without an orange warning from earlier rejected alternatives. A transfer says **quality check pending** until its actual audio is verified. Completed normal-quality downloads show the verified codec/bitrate under **All tracks**. Reported quality stays distinct from a verified file; explicit lower-quality approvals retain their warning.
2. Check the source and quality, then click **Confirm & download**. This approves only that song/source/format and starts its download; it does not lower the global audio standard or retry the rest of the playlist.
3. To supply another source, select **Use a source URL**, paste it and click **Check source & download**. A source below your normal standard waits for the same separate confirmation. A normal-quality source starts processing immediately. Selected local audio files use the same quality confirmation when needed.

Your URL/file choice stays visible after a failure or quality hold. Formats are reported until the actual file is verified; a lower-than-approved bitrate or changed codec requires fresh confirmation. Wrong lengths, broken files, mono/sub-44.1 kHz audio and protected sources are still blocked.

Approved lower-bitrate MP3/AAC keeps its original compressed audio. Opus/Vorbis is decoded to FLAC for rbxport playback without additional lossy compression; that does **not** make its source lossless. Lower-quality files are marked **LOWER** with their original source codec/bitrate in the filename, tags and playlist details. They are never relabelled as 320 kbps MP3.

Expand the playlist and press **Retry missing** to retry held songs across all supported sources using the last checked source list. It reuses local files first. Cancelled jobs and explicit file/URL choices remain under your control. Source-specific failures are shown under **Resolve → Source attempts**: no results, wrong recording/length, low quality, blocked provider or a failed transfer. A song being on the web does not guarantee a qualifying downloadable source.

**Recheck files** scans your existing collection using the saved source list, without downloads or playlist writes. Equivalent comma/slash artist credits now match automatically. **Check existing match** means a local candidate needs confirmation; Resolve offers the suggested tracks in a dropdown. Different mixes and lengths are kept separate.

The add-on checks your entire rbxport collection, including files used in other playlists, before downloading. SoundCloud files sometimes name the uploader or label in their artist tag. A unique existing file can match by its exact full upload title containing the performer credit, matching duration and matching version. Bracketed featured credits and equivalent multi-artist tags are also handled. Duplicate candidates stay for review. After updating, use **Recheck files** to clear stale missing/source warnings for existing uploads.

SoundCloud DRM or a track with no playable formats no longer aborts reading the whole playlist. The add-on reads its metadata, checks your existing files and tries other sources for missing recordings. Protected sources are skipped; recording identity, duration and audio-quality checks still apply. Incomplete playlists remain blocked so a partial list cannot replace your saved source order.

Click the playlist name, then **Resolve** beside a song to see the exact reason. The form opens directly below that song. You can supply an audio file, match an existing collection track by its rbxport track ID, provide another source URL, retry, or ignore it. Save your choice, then Sync again to process it.

In **gear → Audio standard**, choose:

- **MP3 320 kbps / lossless** (default): copy qualifying MP3 audio or convert lossless input to 320 kbps MP3.
- **Also allow AAC 256 kbps or higher**: preserve qualifying AAC as `.m4a`, without lossy re-encoding. MP3 still needs 320 kbps. Lower-bitrate audio and Opus need the separate per-song confirmation described above.

Identity, mix/version, duration, sample rate, stereo and full decoding are checked on actual audio. Missing advertised bitrate is a reason to download a candidate for verification, not to reject it unseen. An incorrectly advertised, truncated or wrong file is rejected and another candidate is tried. Manual URLs use the same audio checks; Newgrounds audio-listen URLs are supported. Existing collection files are reused without a new quality certification.

Only download audio you are entitled to acquire. Format checks cannot prove that a file was never upscaled previously.

## Soulseek fallback

1. Open the **gear → Soulseek fallback**. Enter your existing Soulseek username and password, enable **Use as fallback on Sync**, and click **Save account**. If another Soulseek client is running, use a separate account to avoid disconnecting it.
2. Expand a linked playlist and click **Retry missing**. It checks local matches and web sources before using Soulseek for unresolved recordings. Ordinary Sync can also fall back to Soulseek when enabled.
3. The add-on downloads and verifies the optional [Sockseek helper](https://github.com/fiso64/sockseek) automatically on first use. It retries cleaned artist/title queries and broader searches, accepts incomplete peer metadata for inspection, and checks the actual downloaded recording and audio against your selected standard. A rejected peer file can be followed by a different peer. No separate app window is needed.

Progress and Cancel stay in the existing panel. Unavailable tracks remain unresolved; click the batch action to retry them later. A sign-in or setup failure stops the batch. Temporary connection failures back off peer searches for one minute while other songs continue. Peer availability and queues affect completion time. Each track has bounded search and transfer retries; do not expect every track to be available.

Credentials are stored with Windows account encryption and never appear in API models, logs or command arguments. The helper needs a temporary local plaintext config while running; it is removed afterward and cleaned on the next launch after an interrupted run. Incoming peer connections are **off by default**. You can enable **Allow incoming peer connections** in Soulseek settings: it opens a temporary TCP listener on port 49998 while the helper runs, without sharing music or changing firewall/router rules. Use the [validation record](validation.md) for the exact live tests and limitations.

## Deleting a playlist

Deleting a linked playlist in rbxport also clears its add-on link, pending entries and playlist-specific history after the next successful host check, normally within 20 seconds. An active queue for that target is cancelled first. Other libraries and shared track records are retained. Downloaded music and collection bindings are not deleted.

## Stop or update

- **Stop:** Close rbxport. Playlist Sync cancels current work and shuts down with it. Closing only the popup keeps syncing while rbxport remains open.
- **Update:** Stop the add-on and run the latest setup EXE. Setup checks installation registration, shortcuts and the standard folder, then updates that copy in place. Use **Choose existing folder** for an unregistered portable copy or to resolve multiple copies. Saved links, accounts, settings and music stay in their existing location. Matching program files are overwritten; obsolete files are not yet removed automatically. Updates remain manual.
- **Uninstall:** Use **Playlist Sync → gear → Uninstall Playlist Sync**, or Windows **Installed apps**. Finish or cancel active work, then confirm. Music, library playlists, saved settings, edited files and companion add-ons are retained.
- **Updating rbxport itself:** Its installation is separate from the add-on and saved data. Update rbxport normally, close it, then reopen it through the Playlist Sync shortcut. Compatibility is currently tested with rbxport 1.9.0. A newer release can change automation commands, the local connection or sidebar structure and require an add-on update; compatibility is not guaranteed.
- **Can’t find the panel?** With automatic attachment configured, use the standard compatible rbxport Start Menu or Desktop shortcut. Otherwise use the **Playlist Sync** shortcut. Look below Tag List. A missing local connection or changed sidebar produces a launcher error. A failed library check stays visible in the popup with syncing disabled. The older Store 0.19.3 entry remains incompatible even with startup enabled. Use **Reconnect** after correcting the connection.

For a connection-only diagnostic launch, the service accepts `node src/server.mjs --pause-automatic` (with your usual `--data-dir` if applicable). This pauses scheduled sync for that process without changing saved playlist preferences; manual Sync remains available. To resume normal scheduling, close rbxport and open its configured shortcut again. A directly launched developer service can still be stopped with `Stop-Playlist-Sync.ps1`.

Settings and downloads are stored in `%LOCALAPPDATA%\rbxport-playlist-sync`. Use the gear to change the download folder. Keep this data folder, cookies and credentials private.
