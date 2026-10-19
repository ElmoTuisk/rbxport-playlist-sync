# Playlist Sync for rbxport

A small add-on that links your Spotify and SoundCloud playlists to rbxport. It reuses songs already in your collection, searches multiple sources for missing recordings, and checks actual audio before importing it.

**Retry missing** checks SoundCloud originals/search, Newgrounds and YouTube, then an optional Soulseek fallback. One failed provider or file does not discard the other candidates.

**Windows x64 · Experimental v0.6.2 · Tested with rbxport 1.9.0**

[Download Windows setup](https://github.com/ElmoTuisk/rbxport-playlist-sync/releases/latest) · [Report an issue](https://github.com/ElmoTuisk/rbxport-playlist-sync/issues)

## Install

1. Install [rbxport for Windows](https://github.com/chrisle/rbxport/releases/latest).
2. From **[Releases](https://github.com/ElmoTuisk/rbxport-playlist-sync/releases/latest)**, download **`playlist-sync-0.6.2-windows-setup.zip`** under Assets. Use the setup ZIP, rather than “Source code”.
3. Right-click the ZIP → **Extract All…** Keep the extracted files together.
4. Close rbxport normally, then double-click **`Install-Playlist-Sync.cmd`** in the extracted folder.
5. Wait for **“Installed successfully”**. Setup downloads and verifies the required tools, creates Desktop and Start Menu shortcuts, and launches the add-on. No administrator access or separate Node installation is needed; internet access is required.
6. In rbxport, click **Playlist sync**, directly below **Tag List** on the left.

For future sessions, use the **Playlist Sync** Desktop or Start Menu shortcut. If rbxport is already open from its normal shortcut, close it normally first.

## Link your first playlist

1. Copy a public SoundCloud or Spotify playlist URL. Spotify account setup is below if needed.
2. Open **Playlist sync → + Link playlist**.
3. Paste the URL and choose an existing rbxport playlist, or select **Create new…**. Save.
4. The add-on previews the link without importing or rearranging songs. Click the playlist name to inspect it, then press **Sync** when ready. rbxport must allow library writes.
5. Enable **Auto-sync** in the playlist details for hourly checks while rbxport and the add-on are running.

Available source songs go first, in source order. Extra local songs stay at the bottom in their original relative order, with a notice. Sync never automatically deletes your audio files or existing playlist entries.

A small **⇄** beside a linked playlist opens its details: green means synced, amber needs attention, blue is syncing, and grey is waiting for a check. Closing the panel keeps background sync running.

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

## Missing songs / “Check source”

Expand the playlist and press **Retry missing** to retry held songs across all supported sources using the last checked source list. It reuses local files first. Cancelled jobs and explicit file/URL choices remain under your control. Source-specific failures are shown under **Resolve → Source attempts**: no results, wrong recording/length, low quality, blocked provider or a failed transfer. A song being on the web does not guarantee a qualifying downloadable source.

**Recheck files** scans your existing collection using the saved source list, without downloads or playlist writes. Equivalent comma/slash artist credits now match automatically. **Check existing match** means a local candidate needs confirmation; Resolve offers the suggested tracks in a dropdown. Different mixes and lengths are kept separate.

The add-on checks your entire rbxport collection, including files used in other playlists, before downloading. SoundCloud files sometimes name the uploader or label in their artist tag. A unique existing file can match by its exact full upload title containing the performer credit, matching duration and matching version. Bracketed featured credits and equivalent multi-artist tags are also handled. Duplicate candidates stay for review. After updating, use **Recheck files** to clear stale missing/source warnings for existing uploads.

SoundCloud DRM or a track with no playable formats no longer aborts reading the whole playlist. The add-on reads its metadata, checks your existing files and tries other sources for missing recordings. Protected sources are skipped; recording identity, duration and audio-quality checks still apply. Incomplete playlists remain blocked so a partial list cannot replace your saved source order.

Click the playlist name, then **Resolve** beside a song to see the exact reason. The form opens directly below that song. You can supply an audio file, match an existing collection track by its rbxport track ID, provide another source URL, retry, or ignore it. Save your choice, then Sync again to process it.

In **gear → Audio standard**, choose:

- **MP3 320 kbps / lossless** (default): copy qualifying MP3 audio or convert lossless input to 320 kbps MP3.
- **Also allow AAC 256 kbps or higher**: preserve qualifying AAC as `.m4a`, without lossy re-encoding. MP3 still needs 320 kbps; lower-bitrate AAC and Opus remain blocked.

Identity, mix/version, duration, sample rate, stereo and full decoding are checked on actual audio. Missing advertised bitrate is a reason to download a candidate for verification, not to reject it unseen. An incorrectly advertised, truncated or wrong file is rejected and another candidate is tried. Manual URLs use the same audio checks; Newgrounds audio-listen URLs are supported. Existing collection files are reused without a new quality certification.

Only download audio you are entitled to acquire. Format checks cannot prove that a file was never upscaled previously.

## Soulseek fallback

1. Open the **gear → Soulseek fallback**. Enter your existing Soulseek username and password, enable **Use as fallback on Sync**, and click **Save account**. If another Soulseek client is running, use a separate account to avoid disconnecting it.
2. Expand a linked playlist and click **Retry missing**. It checks local matches and web sources before using Soulseek for unresolved recordings. Ordinary Sync can also fall back to Soulseek when enabled.
3. The add-on downloads and verifies the optional [Sockseek helper](https://github.com/fiso64/sockseek) automatically on first use. It retries cleaned artist/title queries and broader searches, accepts incomplete peer metadata for inspection, and checks the actual downloaded recording and audio against your selected standard. A rejected peer file can be followed by a different peer. No separate app window is needed.

Progress and Cancel stay in the existing panel. Unavailable tracks remain unresolved; click the batch action to retry them later. A sign-in, connection or setup failure stops the batch. Peer availability and queues affect completion time. Each track has bounded search and transfer retries; do not expect every track to be available.

Credentials are stored with Windows account encryption and never appear in API models, logs or command arguments. The helper needs a temporary local plaintext config while running; it is removed afterward and cleaned on the next launch after an interrupted run. Incoming peer connections are **off by default**. You can enable **Allow incoming peer connections** in Soulseek settings: it opens a temporary TCP listener on port 49998 while the helper runs, without sharing music or changing firewall/router rules. Use the [validation record](docs/validation.md) for the exact live tests and limitations.

## Stop or update

- **Stop:** Start Menu → Playlist Sync → **Stop Playlist Sync**. Close rbxport and reopen it normally to disable its local automation connection.
- **Update:** Stop the add-on, close rbxport, extract the new setup ZIP and run `Install-Playlist-Sync.cmd` again. Saved links, settings and accounts are preserved in the separate data folder. Setup overwrites matching program files but does not yet remove obsolete files from older versions. Updates are manual; there is no automatic updater. After a successful install, the downloaded ZIP and extracted setup folder can be deleted.
- **Can’t find the panel?** Close rbxport and reopen it through the Playlist Sync shortcut. Look below Tag List. Use **Reconnect** if the panel reports a disconnection.

Settings and downloads are stored in `%LOCALAPPDATA%\rbxport-playlist-sync`. Use the gear to change the download folder. Keep this data folder, cookies and credentials private.

## More information

[Full add-on guide](docs/addon-guide.md) · [Validation and limitations](docs/validation.md) · [Architecture](docs/architecture.md) · [Upload to GitHub](docs/github-upload.md)

Independent add-on using rbxport’s opt-in Windows automation connection; no official plugin loader or host rebuild. It may need updating after a rbxport release. Mac and ARM64 setup are not supported.

GPL-2.0-or-later; see [LICENSE](LICENSE). Downloads use yt-dlp and FFmpeg, which retain their own licenses.
