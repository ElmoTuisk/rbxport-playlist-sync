# Playlist Sync for rbxport

Sync Spotify and SoundCloud playlists from a small popup beneath **Tag List**. Reuse your existing songs, find missing recordings and keep the source playlist's order.

**Windows x64 · Experimental v0.11.1 · Tested with rbxport 1.9.0**

**[Download Windows setup](https://github.com/ElmoTuisk/rbxport-playlist-sync/releases/latest)** · [Report an issue](https://github.com/ElmoTuisk/rbxport-playlist-sync/issues) · [Changelog](CHANGELOG.md)

<table>
  <tr><th>Compact popup</th><th>Quality review</th></tr>
  <tr>
    <td><img src="docs/images/playlist-panel.png" width="280" alt="Playlist Sync popup with progress and missing-song actions"></td>
    <td><img src="docs/images/quality-review.png" width="280" alt="Separate confirmation for a lower-quality recording"></td>
  </tr>
</table>

*Actual interface with fictional example data.*

## Quick start

1. Install [rbxport for Windows](https://github.com/chrisle/rbxport/releases/latest).
2. Download **`playlist-sync-0.11.1-windows-setup.exe`** from [Releases](https://github.com/ElmoTuisk/rbxport-playlist-sync/releases/latest).
3. Run the EXE and click **Install / Update**. Setup installs the tools and creates shortcuts; internet is required, administrator access is not. Stop Playlist Sync first if it is running.
4. Open rbxport normally with the default automatic-attachment option, then click **Playlist sync** below **Tag List**. If you turned that option off, use the **Playlist Sync** shortcut.
5. Choose **+ Link playlist**, paste a Spotify/SoundCloud URL and select an existing playlist or create one. Review the preview, then click **Sync**.

To load the add-on when you open regular rbxport, run **Configure-Rbxport-Startup.ps1** from its installed folder (right-click → Run with PowerShell). This starts its background service, adds a Windows sign-in entry and enables the local connection for future rbxport launches. Run it once for each add-on you want enabled; Playlist Sync and Playlist Wizard remain independent. Allow up to 20 seconds for the sidebar buttons to attach. Use the compatible rbxport 1.9.0 installation; the older Store 0.19.3 build lacks the required library API. Without this optional setup, use the Playlist Sync shortcut.

### Install, update and uninstall

Every release provides one **`playlist-sync-<version>-windows-setup.exe`**. Extraction, the private runtime and checksum-verified audio tools are handled automatically. Internet and an existing compatible rbxport installation are required. Administrator access is not required.

For an update, stop the running Playlist Sync copy first. Setup finds the existing copy through its registration, shortcuts or standard installation folder, updates it in place and retains its saved-data location. For an unregistered portable copy, use **Choose existing folder**. Multiple detected copies require that choice. Setup refuses a running copy before changing files.

**Show Playlist Sync when rbxport opens** is checked by default. It starts this add-on in the background and registers its own Windows sign-in shortcut. Close and reopen rbxport once after installation if necessary. The add-on remains separate from the host executable.

Remove a managed installation through **Playlist Sync → gear → Uninstall Playlist Sync**, or Windows **Installed apps**. Confirming removes its program files, shortcuts and its own startup registration; music, playlists, saved settings and Playlist Wizard are retained. Finish or cancel any sync first. Edited/unrecognized files are retained. Updating an older portable copy through the EXE adds this uninstall option.

The complete source, including the installer, remains public in this repository. Releases include the EXE, a source ZIP and SHA-256 checksums after Windows and Linux CI pass. To build it yourself on Windows x64, run `powershell -NoProfile -ExecutionPolicy Bypass -File Build-Installer.ps1`; the result is in `dist/`. The executable is currently unsigned.

## What it does

- **Reuses songs** from your whole collection, including other playlists.
- **Keeps source order**, with extra local songs at the bottom. No automatic music deletion.
- **Checks audio quality**, with individual or bulk approval for lower-quality streams.
- **Adds cover art**, bulk review and optional hourly auto-sync while the app/service run.

Expand a topic for setup and details.

<details>
<summary><strong>Spotify & SoundCloud</strong> — accounts and playlist access</summary>

Public SoundCloud playlists usually need no sign-in. Spotify uses your account or a public page only when its complete track list can be verified.

For Spotify, create an app in the [developer dashboard](https://developer.spotify.com/dashboard), register **`http://127.0.0.1:43821/oauth/spotify`**, then enter its **Client ID** under **gear → Connect Spotify**. No client secret is needed. Large/private playlists may need an eligible account.

[Full account setup and restrictions](docs/usage.md#spotify-setup-optional).

</details>

<details>
<summary><strong>Existing songs & ordering</strong> — reuse files and review matches in bulk</summary>

**Recheck files** refreshes saved matches without downloads or playlist writes. **Accept suggested matches → Accept N & reorder** reviews local files in bulk and applies source order. Different lengths/versions require an explicit choice; extras retain their order at the bottom.

Deleting a target clears its add-on link after a successful library check, while keeping music and reusable collection bindings.

[Bulk matching](docs/usage.md#accept-existing-matches-in-bulk) · [Playlist cleanup](docs/usage.md#deleting-a-playlist).

</details>

<details>
<summary><strong>Missing songs</strong> — retries, source URLs and Soulseek</summary>

**Retry missing** checks local files, SoundCloud originals/search, Newgrounds and YouTube, then optional Soulseek. **Resolve** shows source attempts and lets you select an existing song, file, another URL, retry or ignore.

Enable Soulseek under **gear → Soulseek fallback** with your existing account; its helper installs automatically. Online availability does not guarantee an accessible file at your selected quality. Protected, preview-only, wrong-version and broken files stay blocked.

The add-on also offers **gear → Advanced → Spotisaver for Spotify tracks**: **Off**, **Last resort, after Soulseek**, or **Try first, then other sources**. Last resort runs only after web discovery and enabled Soulseek supply no verified file; with Soulseek disabled, it follows web discovery. It requires an actual 320 kbps MP3 and preserves that audio without re-encoding. Original source quality stays labelled **unverified**. Use **Verify Spotisaver** to open its dedicated Edge/Chrome window, finish any verification, then retry in the app. Keep that window open or minimized. Three selected live recordings passed the 320 kbps checks; broader reliability remains unproven. The option defaults off. [Connection details and limitations](docs/spotisaver.md).

[Missing-song actions](docs/usage.md#missing-songs--check-source) · [Soulseek setup](docs/usage.md#soulseek-fallback).

</details>

<details>
<summary><strong>Audio quality</strong> — standards, bulk approval and official downloads</summary>

Default: **MP3 320 kbps / lossless**. You can also allow **AAC 256 kbps** under the gear. Identity, version, length, stereo, sample rate and complete decoding are checked. A reported bitrate or 320 kbps output alone does not prove source quality.

Ordinary lower-quality audio needs **Review quality → Confirm & download**, or **Accept lower quality… → Accept N & download** for a reviewed batch. These exceptions retain the real source quality and leave your global standard unchanged.

Artist-enabled SoundCloud originals are tried first and accepted at their original bitrate by default, including lower quality with a clear label. This can be disabled in Advanced settings; sign-in/cookies may be needed. External download gates are not submitted automatically.

[Quality approval](docs/usage.md#accept-lower-quality-songs-in-bulk) · [Official downloads](docs/usage.md#soundcloud-official-downloads).

</details>

<details>
<summary><strong>Album covers</strong> — artwork embedded in new downloads</summary>

New MP3/M4A/approved FLAC downloads embed the exact Spotify album or SoundCloud track artwork, preserving existing attached covers as fallback. Missing artwork keeps verified audio and shows **cover unavailable**. Existing collection files are not rewritten.

[Artwork details](docs/usage.md#embedded-album-covers).

</details>

<details>
<summary><strong>Updates & stopping</strong> — keep saved settings and music</summary>

**Stop:** Start Menu → Playlist Sync → **Stop Playlist Sync**.

**Update:** stop the add-on and run the latest setup EXE. It updates the detected installation; use **Choose existing folder** for an unregistered portable copy. Saved links, settings, accounts and music are preserved. Updates are manual; matching program files are overwritten, but obsolete files are not yet removed automatically.

Updating rbxport is separate and may require an add-on update. Reopen through Playlist Sync afterward. Keep the data folder, normally `%LOCALAPPDATA%\rbxport-playlist-sync`, private.

[Update and recovery details](docs/usage.md#stop-or-update).

</details>

<details>
<summary><strong>Troubleshooting</strong> — missing panel and connection errors</summary>

**No panel?** With automatic attachment configured, open compatible rbxport and allow up to 20 seconds. Otherwise open the **Playlist Sync** shortcut. Look below Tag List; its background service must remain running. If you enabled startup while rbxport was already open without a local connection, close and reopen rbxport normally once.

**Library error?** rbxport **1.9.0** is tested; Store **0.19.3** lacks the required library API. The popup shows the problem and disables library actions. Old host errors clear after a verified reconnect; **Recheck files** refreshes song matches.

This independent add-on uses a local automation connection, without an official plugin loader. Later host updates may affect compatibility. Mac and ARM64 setup are not supported.

[Connection guidance](docs/usage.md#stop-or-update) · [Report an issue](https://github.com/ElmoTuisk/rbxport-playlist-sync/issues).

</details>

<details>
<summary><strong>Technical details & limitations</strong> — performance, testing and development</summary>

Hidden/unchanged renders are skipped, metadata caches are bounded and acquisition runs serially. Downloads and analysis still use resources while active.

Fully inspected search results now arrive as they are ready. SoundCloud/YouTube metadata searches overlap, with at most two providers active; source preference and all recording/audio checks stay the same. Unused searches are cancelled. [Search performance and test evidence](docs/validation.md#faster-candidate-discovery-0105).

A 95% completion rate has **not** been established. Downloads, existing-file reuse and quality holds are counted separately. Only acquire audio you are entitled to download; format checks cannot prove a file was never upscaled before acquisition.

[Detailed usage](docs/usage.md) · [Project overview](PROJECT_OVERVIEW.md) · [Architecture](docs/architecture.md) · [Validation](docs/validation.md) · [Playlist testing](docs/playlist-testing.md) · [Development guide](docs/addon-guide.md) · [Contributor notes](AGENTS.md)

</details>

GPL-2.0-or-later · [License](LICENSE) · Independent add-on for [rbxport](https://github.com/chrisle/rbxport).
