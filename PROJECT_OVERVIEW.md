# Project overview

Updated 23 October 2026. Development version: **v0.11.5 (unreleased)**, experimental Windows x64 add-on for rbxport.

[Quick start](README.md) · [Detailed usage](docs/usage.md) · [Architecture](docs/architecture.md) · [Test evidence](docs/validation.md) · [Playlist test criteria](docs/playlist-testing.md) · [Changelog](CHANGELOG.md)

## Purpose and product direction

Link Spotify and SoundCloud playlists to rbxport, reuse recordings already in the collection, acquire missing recordings from accessible sources and preserve source order. The interface should stay small: one sidebar entry beneath Tag List, a popup and linked-playlist symbols. Avoid a separate dashboard or a growing collection of tabs.

The reliability target is approximately 95% automatic completion across varied playlist tests, at the best accessible quality allowed by the user's policy. That rate has **not** been established. Report new downloads, existing-file reuse, quality holds, unavailable sources and pending songs separately.

## What is implemented

| Area | Current behavior |
| --- | --- |
| Playlist links | Spotify/SoundCloud sources linked to existing or newly created rbxport playlists; optional scheduled sync while the app/service run |
| Collection reuse | Search the whole collection, prefer unambiguous target members and retain saved decisions; bulk review for eligible existing matches |
| Acquisition | SoundCloud originals/search, Newgrounds and YouTube discovery, plus optional Soulseek fallback; bounded retries and actual file validation |
| Search performance | Stream complete candidate metadata as it arrives; overlap primary SoundCloud/YouTube with bounded queues and preserved source preference; cancel unused work |
| Quality | Default MP3 320 kbps/lossless requirement; optional AAC 256 kbps policy; no lossy upscaling to satisfy the policy |
| Lower-quality exceptions | Individual or reviewed bulk approvals for ordinary streams; artist-enabled SoundCloud originals accepted at their actual bitrate by default, with explicit labelling |
| Artwork | Exact Spotify album/SoundCloud track artwork embedded in new MP3/M4A/approved FLAC downloads; preserve attached covers as fallback; unavailable artwork does not discard audio |
| Ordering | Resolved source songs first in source order; extra local entries retained at the bottom in their existing relative order |
| Cleanup | A deleted target clears its add-on records after a successful current-library check; audio files and reusable collection bindings are retained |
| UI | Compact popup, progress/cancel, source review, quality approvals and linked-playlist badges; current verified file status takes priority over old lower-quality alternatives |
| Packaging | Single-file setup EXE, existing-copy updates, verified private runtime/tools, preserved saved data and GitHub Actions publication after both CI platforms pass |

## How it integrates

This is an independent add-on, not an official rbxport plugin loaded by a permanent extension API. A Node.js 24 service connects to rbxport's opt-in local WebView automation port and uses guarded existing commands. It injects the sidebar button and popup into the running window. It does not edit the host executable or open/write the music database directly.

The intended signed release connects the original per-user rbxport Desktop and Start Menu shortcuts to every enabled add-on through a neutral shared launcher. Current source integration requires approved signatures, which are not available yet. Both Sync and Wizard follow the exact host process and stop when it exits. Neither starts at Windows sign-in. Conventional separate add-on shortcuts are removed; customized shortcuts are preserved. Disabling either registration keeps the other working; disabling the last restores unchanged original shortcut bytes and the previous port unless independently changed. Direct executable and older Store launches bypass the wrapper. There is no automatic updater.

**Compatibility:** Windows rbxport 1.9.0 is the tested host. Store build 0.19.3 lacks the required `database_drives` library-identity command. v0.10.2 excludes that older package from automatic selection and verifies an attached, visible sidebar button before reporting launch success. Later builds still need compatibility checks; version-based discovery alone is not proof of compatibility.

v0.10.3 separates sidebar attachment from library validation. A failed library check leaves the sidebar available with a diagnostic and disabled library actions; saved links are preserved. This is diagnostic visibility, not syncing compatibility with Store 0.19.3.

v0.10.4 clears saved playlist failures caused by that missing API once the same library and target reconnect successfully. It retains historical errors and asks for a file recheck instead of marking songs ready merely because the connection recovered.

## Code map

| Location | Responsibility |
| --- | --- |
| `src/server.mjs` | Paired local API, OAuth callback, UI model and host coordination |
| `src/engine.mjs`, `src/store.mjs` | Serialized jobs, saved links/approvals, library checks, ordering, reconciliation and SQLite state |
| `src/bridge.mjs`, `src/host-ui.mjs` | Guarded host commands, connection, sidebar insertion and popup lifecycle |
| `public/panel.mjs`, `public/style.css` | Shared compact interface and quality/progress wording |
| `src/providers.mjs`, `src/soundcloud.mjs` | Complete source snapshots, Spotify authentication and bounded public SoundCloud hints |
| `src/downloads.mjs`, `src/quality.mjs`, `src/matching.mjs` | Discovery, recording/version/duration checks, staging, audio verification and publication |
| `src/discovery.mjs`, `src/process.mjs` | Bounded ordered metadata streams, cancellation and safe child-process output |
| `src/artwork.mjs`, `src/soulseek.mjs` | Cover retrieval/embedding preparation and optional peer fallback |
| `scripts/Desktop.ps1`, root launch/install scripts | Executable discovery, startup readiness, setup and shortcuts |
| `test/` | Isolated engine/renderer/launcher/API fixtures and real synthetic audio checks |
| `.github/workflows/test.yml` | Windows/Linux CI; setup EXE, source ZIP, checksums and release publication for matching version tags |

## Validation and current status

The v0.11.4 / Wizard v0.1.1 interim releases passed Windows/Linux CI, but a subsequent user check confirmed that Smart App Control blocks their unsigned generated launcher. They are marked as pre-releases with this warning. Main contains the next unreleased close/reopen correction; no completed Smart App Control-compatible fix is claimed. Windows protection remains enabled.

v0.10.5 passed **148 local Windows tests** with real FFmpeg/ffprobe and DPAPI enabled, with no skips. A read-only same-query metadata comparison fell from 37.65 to 16.01 seconds for all primary results, retaining ten SoundCloud and ten YouTube candidates; Newgrounds was unavailable in both. This is not a whole-playlist speed or completion guarantee. The validation record distinguishes mocked fixtures, discovery-only audits and actual verified downloads.

The mainstream EDM playlist exercised successful Soulseek acquisition and embedded covers. One reported 320 kbps download was independently checked: its source/output codec, bitrate and duration matched and its compressed audio packet hash was unchanged. Discovery audits covered five linked playlist snapshots; these were not five complete acquisition benchmarks.

With fresh user authorization, the patched service restored a visible sidebar button in the running Store 0.19.3 window while correctly blocking its unsupported library API. A normal close/relaunch into the installed rbxport 1.9.0 then verified both a visible button and successful guarded library connection. Five saved links remained, with no active sync or new downloads. Automatic sync was paused for the diagnostic session; saved scheduling preferences were retained.

The following UKG warning was confirmed to be an old saved failure rather than a current connection error. After recovery, a cached file recheck matched all 46 source songs. All 56 target entries and their order were independently confirmed unchanged; no audio was acquired or imported.

The game-music playlist was a test reference only. No game-music audio should be acquired/imported as part of that test.

## Next work

The Windows setup executable (`Build-Installer.ps1`) is the main download for every release. It discovers existing copies through registration, shortcuts and the standard folder; an optional folder picker handles unregistered portable copies. Updates keep the existing saved-data path. Managed uninstall preserves music, playlists, settings and companion add-ons. Source remains public. Trusted signing is pending; source builds now refuse unsigned shortcut integration. See the [code signing policy](docs/code-signing.md) for staged signing, the exact-candidate Windows validation gate and remaining work.

The separate [Playlist Wizard development project](playlist-wizard/README.md) now implements a local draft builder, autosort into a new playlist, count/duration choices, energy curves and a compact independent popup. It has its own service, data and setup. Authorized Windows installation verified its visible sidebar/popup and guarded connection on rbxport 1.9.0. Playlist-output/USB compatibility and musical quality remain unverified; see its validation record. The Sync bridge shares only a cooperative native-write lease with it.

This release includes an optional Spotisaver connection with first-source or last-resort selection and strict 320 kbps MP3 validation. Last resort follows ordinary web sources and enabled Soulseek, retaining earlier attempts and explicit source choices. Verify Spotisaver opens a dedicated Edge/Chrome session and retains site cookies there. Three selected live recordings passed acquisition and audio checks through that browser after direct HTTP requests were challenged. Upstream audio quality stays unverified; see [connection evidence](docs/spotisaver.md). This does not establish a general acquisition or completion target.

1. Continue testing session shutdown and shortcut launches across additional host versions. Original Desktop and Start Menu launches with both visible add-ons and host-owned shutdown were verified on rbxport 1.9.0; see the validation record.
2. Finish representative full acquisition runs and record denominators, actual source quality, retries, quality holds and completion time. Establish evidence before making a 95% claim.
3. Improve compatibility diagnostics and investigate additional host versions without guessing the open library or weakening identity guards.
4. Improve update cleanup: matching installed files are overwritten today, but obsolete program files are not removed automatically. Preserve saved data and music.
5. Keep the UI and background work small as reliability improves. Existing measures include bounded caches, serial acquisition, coalesced progress and skipping hidden/unchanged renders.

## Development and release

Use Node.js 24. Run `node --test test/*.test.mjs`; set `FFMPEG` and `FFPROBE` to installed executables to include the real audio tests locally. Windows is needed for the PowerShell/DPAPI checks. Use synthetic audio and fixture libraries for routine work.

For a release, update current version fields in `package.json`, `manifest.json`, README and current install/upload guidance. Add a changelog entry and update validation evidence; keep historical entries intact. Push the source and a matching `vX.Y.Z` tag. GitHub Actions waits for both test platforms, packages the allowlisted source, rejects private-data entries, builds the required single-file EXE, writes SHA-256 checksums and publishes both EXE and source ZIP. A failed build must not be presented as a published update.

Do not commit or package credentials, pairing URLs, cookies, private diagnostics, music, `.local-data`, `.runtime` or `.tools`. The runtime's saved state remains separate from the source checkout. See `AGENTS.md` for maintenance rules.
