# Playlist Sync for rbxport

A small add-on that links your Spotify and SoundCloud playlists to rbxport. It reuses songs already in your collection and checks missing downloads before importing them.

Optional **Soulseek batch fallback** searches for missing recordings while keeping the 320 kbps MP3/lossless requirement.

**Windows x64 · Experimental v0.4.0 · Tested with rbxport 1.9.0**

[Download Windows setup](https://github.com/ElmoTuisk/rbxport-playlist-sync/releases/latest) · [Report an issue](https://github.com/ElmoTuisk/rbxport-playlist-sync/issues)

## Install

1. Install [rbxport for Windows](https://github.com/chrisle/rbxport/releases/latest).
2. From **[Releases](https://github.com/ElmoTuisk/rbxport-playlist-sync/releases/latest)**, download **`playlist-sync-0.4.0-windows-setup.zip`** under Assets. Use the setup ZIP, rather than “Source code”.
3. Right-click the ZIP → **Extract All…** Keep the extracted files together.
4. Close rbxport normally, then double-click **`Install-Playlist-Sync.cmd`** in the extracted folder.
5. Wait for **“Installed successfully”**. Setup downloads and verifies the required tools, creates Desktop and Start Menu shortcuts, and launches the add-on. No administrator access or separate Node installation is needed; internet access is required.
6. In rbxport, click **Playlist sync**, directly below **Tag List** on the left.

For future sessions, use the **Playlist Sync** Desktop or Start Menu shortcut. If rbxport is already open from its normal shortcut, close it normally first.

## Link your first playlist

1. Copy a public SoundCloud playlist URL, or connect Spotify below and copy a Spotify playlist URL.
2. Open **Playlist sync → + Link playlist**.
3. Paste the URL and choose an existing rbxport playlist, or select **Create new…**. Save.
4. The add-on previews the link without importing or rearranging songs. Click the playlist name to inspect it, then press **Sync** when ready. rbxport must allow library writes.
5. Enable **Auto-sync** in the playlist details for hourly checks while rbxport and the add-on are running.

Available source songs go first, in source order. Extra local songs stay at the bottom in their original relative order, with a notice. Sync never automatically deletes your audio files or existing playlist entries.

A small **⇄** beside a linked playlist opens its details: green means synced, amber needs attention, blue is syncing, and grey is waiting for a check. Closing the panel keeps background sync running.

## Spotify setup (optional)

Public SoundCloud playlists usually need no sign-in. Spotify requires your own developer app and an eligible account.

1. Create an app in the [Spotify developer dashboard](https://developer.spotify.com/dashboard) with Web API access.
2. Register this exact redirect URI in the app settings and save it:

   ```text
   http://127.0.0.1:43821/oauth/spotify
   ```

3. Copy its **Client ID**. No client secret is needed.
4. In the add-on, open **gear → Connect Spotify**, paste the Client ID and click **Connect**.
5. Finish authorization in your browser, then check for **Spotify connected** in the panel.

Start sign-in with **Connect**; opening the redirect address directly does not sign you in. For an expired attempt, click Connect again. Spotify’s [development-mode restrictions](https://developer.spotify.com/documentation/web-api/tutorials/february-2026-migration-guide) apply. Live Spotify account authorization still needs a full integration test.

## Missing songs / “Check source”

**Recheck files** scans your existing collection using the saved source list, without downloads or playlist writes. Equivalent comma/slash artist credits now match automatically. **Check existing match** means a local candidate needs confirmation; Resolve offers the suggested tracks in a dropdown. Different mixes and lengths are kept separate.

Click the playlist name, then **Resolve** beside a song to see the exact reason. The form opens directly below that song. You can supply an audio file, match an existing collection track by its rbxport track ID, provide another source URL, retry, or ignore it. Save your choice, then Sync again to process it.

New downloads require a **320 kbps MP3 or lossless source** and produce **320 kbps MP3**. Track identity, length and full audio decoding are checked. Most YouTube audio is AAC/Opus and will fail this strict source requirement; re-encoding it would not restore quality. Manual URLs must pass the same checks. Existing collection files are reused without a new quality certification.

Only download audio you are entitled to acquire. Format checks cannot prove that a file was never upscaled previously.

## Soulseek fallback

1. Open the **gear → Soulseek fallback**. Enter your existing Soulseek username and password, enable **Use as fallback on Sync**, and click **Save account**. If another Soulseek client is running, use a separate account to avoid disconnecting it.
2. Expand a linked playlist and click **Find missing with Soulseek**. It rechecks local matches, then queues only unresolved recordings using the last checked source list. Ordinary Sync can also fall back to Soulseek when enabled.
3. The add-on downloads and verifies the optional [Sockseek helper](https://github.com/fiso64/sockseek) automatically on first use. It searches for MP3 at 320 kbps or lossless files, requires matching identity and duration, and verifies actual audio before import. No separate app window is needed.

Progress and Cancel stay in the existing panel. Unavailable tracks remain unresolved; click the batch action to retry them later. A sign-in, connection or setup failure stops the batch. Peer availability and queues affect completion time, and tracks without the required metadata may be filtered out. Do not expect every track to be available.

Credentials are stored with Windows account encryption and never appear in API models, logs or command arguments. The helper needs a temporary local plaintext config while running; it is removed afterward and cleaned on the next launch after an interrupted run. The add-on enables no incoming Soulseek listener and does not share your music folders. Live account downloads still need verification with your own account; automated checks and a real helper test used synthetic audio only.

## Stop or update

- **Stop:** Start Menu → Playlist Sync → **Stop Playlist Sync**. Close rbxport and reopen it normally to disable its local automation connection.
- **Update:** Stop the add-on, close rbxport, extract the new setup ZIP and run `Install-Playlist-Sync.cmd` again. Saved links and settings are preserved.
- **Can’t find the panel?** Close rbxport and reopen it through the Playlist Sync shortcut. Look below Tag List. Use **Reconnect** if the panel reports a disconnection.

Settings and downloads are stored in `%LOCALAPPDATA%\rbxport-playlist-sync`. Use the gear to change the download folder. Keep this data folder, cookies and credentials private.

## More information

[Full add-on guide](docs/addon-guide.md) · [Validation and limitations](docs/validation.md) · [Architecture](docs/architecture.md) · [Upload to GitHub](docs/github-upload.md)

Independent add-on using rbxport’s opt-in Windows automation connection; no official plugin loader or host rebuild. It may need updating after a rbxport release. Mac and ARM64 setup are not supported.

GPL-2.0-or-later; see [LICENSE](LICENSE). Downloads use yt-dlp and FFmpeg, which retain their own licenses.
