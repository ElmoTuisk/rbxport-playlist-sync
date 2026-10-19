# Architecture and maintenance notes

## Per-song quality approvals in 0.7.0

Discovery records lower-quality alternatives only after candidate identity/duration checks. Options carry a server-generated ID binding the track key, source URL, format, codec, reported or verified bitrate and optional staged file. They do not change settings or start an unapproved lower-quality download. Explicit URL selection persists its value before metadata inspection; selected local files are probed/decoded first. Errors and quality holds retain the selection, and renderer drafts survive refreshes.

The renderer separates Review from Confirm & download. The server looks up the option from the current job, saves its per-song approval and starts a targeted operation using the normal process/import pipeline. Other missing songs are not retried. Fresh URL/file selection revokes previous approval. Download format IDs are pinned; unavailable IDs never fall back to another format. A changed codec, bitrate below 90% of the reported approval or unexpectedly unknown bitrate holds a verified staged file for fresh confirmation. Unknown stream bitrate stays labelled unknown. Duration, full decoding, stereo/sample-rate and DRM checks remain mandatory.

MP3/AAC use packet copying. rbxport's configured decoder does not support Opus/Vorbis directly, so approved sources of those types decode to FLAC at the original sample rate, with no additional lossy encoding. The saved source report, filename, comment tag and panel preserve the original lower-quality codec/bitrate; the resulting FLAC container is not evidence of a lossless original. A separate LOWER filename avoids replacing a standard-quality published file. Only the selected row is imported/analyzed; guarded source ordering and stable extras follow afterward.

## Optional Soulseek fallback

`Soulseek` provisions the separately licensed Sockseek 3.0.6 Windows helper only on demand. Both its official archive and extracted executable are pinned by SHA-256 in dependencies.json. The tool and its license live below the private data directory, outside source and release ZIPs. Incoming connections are disabled by default. An explicit setting enables the helper's temporary TCP 49998 listener; the adapter does not share music or change firewall/router rules.

The engine checks local collection matches first. A cached recheck needs no provider API call and performs no host writes. An enabled fallback can acquire a recording when the web source fails or a local candidate cannot be approved. Multiple confident local copies still require a choice. Explicit source/file overrides remain authoritative. The batch retry uses the saved source list and explicitly retries held Soulseek failures; ordinary scheduled sync does not repeatedly hammer those failures.

Each unresolved recording uses a quoted single-row CSV with artist, title and seconds. The helper filters known unsuitable formats/quality, ranks identity and runs broader search passes, but does not discard missing remote metadata. It has no yt-dlp fallback. Searches are paced across child processes. The adapter independently checks downloaded tags/filename, mix, duration, codec and full audio decoding before the existing MP3/M4A publishing/import pipeline. It never imports helper output merely because a search succeeded. Authentication, connection and tool setup errors stop the batch; individual unavailable or rejected files stay in review.

Soulseek credentials use a separate Windows DPAPI vault. API models expose username/configured/enabled status and the explicit incoming-connection preference. A temporary configuration file supplies credentials to the child without command-line passwords; its contents are removed in a finally block, and interrupted-run authentication files are cleaned at initialization. Download progress accepts only numeric progress events, never raw logs, peer names or secrets. The temporary file is plaintext while in use; the data directory must remain private.

The add-on is a dependency-free Node.js 24 application with a small popover displayed inside rbxport. A new entry sits directly below Tag List on the left. The Windows installer provisions a private runtime and audio tools; users do not need Node on PATH. No host source patch is required. Inspect rbxport compatibility before upgrading beyond the tested release.

## Desktop lifecycle and installation

`Install-Playlist-Sync.ps1` verifies pinned downloads from `dependencies.json` before executing or extracting tools. It installs app files under the user's LocalAppData Programs directory and writes `installed.json` containing the separate user-data directory. Only allowlisted application files are copied; source-folder state is never copied into another user's installation. Existing settings remain authoritative on update. No global PATH changes, administrator privileges or scheduled tasks are needed.

`Start-Playlist-Sync.ps1` detects the host, starts the service and asks it to show the native popover. Opening the shortcut starts both programs; later, the entry under Tag List or a linked-playlist symbol opens the panel. There is no separate window in the default flow. Optional `-Detached` mode uses a 430 × 500 Edge/Chrome app window with a dedicated profile. Start Menu includes a separate Stop shortcut. The HTTP pairing token remains separate from rbxport's automation port.

## Native view

`host-ui.mjs` installs the entry, popover, scoped constructable stylesheet and visual playlist badges through the existing CDP session. `public/panel.mjs` is a self-contained renderer reused in the native popover and HTTP fallback. No iframe, CSP change or host network-policy change is needed. Node sends the panel model; local UI actions travel through a Runtime binding. It is registered only in the default main-page execution context, and binding events are checked against main-frame ID and the expected Tauri origin. Requests use an allowlisted action dispatcher and request/reply IDs.

Playlist badges use the native drop-target ID where available. Read-only rows omit that attribute, so the fallback matches exact unique playlist names in the current library tree. Ambiguous names are skipped. Links are filtered by the currently open library before annotations are drawn. Nothing is written into playlist names or database metadata.

A child-list MutationObserver reapplies controls after React updates and tree virtualization. It does not observe high-frequency audio style changes. Updates carry an expiry; a stopped service cannot leave a permanent false status symbol. Clean shutdown explicitly disposes annotations, stylesheet and event handlers. Reconnection and a low-frequency heartbeat recover after a window reload. This remains a version-specific adapter, not an official extension API.

`defaults.mjs` configures installed audio tools and a Music folder on first run only. Portable source launches continue using `.local-data`. Setup updates copy files into existing app subdirectories without nesting them and refuse to replace an actively running installed service.

## Modules

| Module | Responsibility |
| --- | --- |
| `server.mjs` | Local authenticated HTTP API, static UI, events and OAuth callback |
| `bridge.mjs` | Local WebView2 CDP connection and allowlisted existing Tauri commands |
| `host-ui.mjs` | In-rbxport entry, anchored popover, status symbols and request/reply binding |
| `public/panel.mjs` | Shared minimal panel with expandable issues and settings |
| `providers.mjs` | Playlist normalization, complete snapshots, Spotify PKCE/token refresh, Windows credential encryption |
| `matching.mjs` | Conservative identity/version/duration matching and stable source-first order |
| `downloads.mjs` | Candidate discovery, format selection, staging, audio validation and publication |
| `quality.mjs` | Pure encoding and audio-stream quality rules |
| `engine.mjs` | Serialized preview/sync, saved matches, job recovery, scheduling and review decisions |
| `store.mjs` | SQLite WAL document buckets and atomic snapshot persistence |
| `process.mjs` | Shell-free subprocess execution, cancellation, bounded output and timeouts |

## Sync lifecycle

1. Read a complete source playlist. Spotify pagination checks total count and snapshot consistency. SoundCloud metadata extraction must complete without missing entries or missing title/duration.
2. Read the collection and target through rbxport. Check actual file availability. Fail on a changed library identity.
3. Build source-ordered rows. Apply saved decisions before conservative matching. Prefer exactly one certain match already in the target. Persist the new snapshot atomically in the add-on's database.
4. Preview stops here. A sync reuses existing matches and processes missing songs serially.
5. Reject known unsuitable identities, lengths and formats before downloading. Missing remote bitrate/length can trigger provisional acquisition; probe and fully decode the actual file before accepting it. Convert lossless to MP3 320 or copy MP3 packets; an explicit AAC-256 policy copies AAC packets to M4A. Verify the final audio. Never overwrite a previously published file.
6. Import via rbxport. Persist a binding before playlist membership/analysis, so retries reuse the file. Mark ready only after required work succeeds.
7. Read the target again. Place resolved source track IDs first, with all remaining entries following. Journal before/after order and verify target IDs immediately before calling native reorder. Refuse order changes with duplicate memberships.
8. Store outcome and schedule the next check. Quality-review jobs are not repeatedly acquired until a user retries or supplies a source. A rate limit delays the next attempt.

## Data model

Spotify tokens remain in the existing CurrentUser-DPAPI `spotify.dpapi` vault. A separate encrypted `spotify-auth.dpapi` vault contains the public Client ID, pending state/PKCE-verifier pairs with ten-minute expiry, and short-lived completed-state results for idempotent callback handling. Pending state is persisted before the authorization URL is returned. Code exchanges are single-flight per state; unknown, missing and expired states never bypass validation. Incomplete callbacks do not consume a valid pending attempt. UI models expose only connection status and Client ID, never tokens or verifiers. Browser callback pages use their own minimal HTML/CSS and do not expose local API pairing tokens.

`documents(bucket, id, value)` stores JSON records. Buckets: settings, links, rows, bindings, jobs, runs, orders. Links pin the original normalized library path and target playlist ID. Source keys are provider plus stable track ID. Binding/job identity combines source key and library identity; jobs can be shared when a track belongs to several linked playlists. Rows also include the link ID and position. Removed source rows remain historical with `present: false`.

Stage updates are durable individual writes, not a distributed transaction. Startup marks unfinished active stages as interrupted. Idempotent native imports and membership checks prevent repeated file imports or playlist membership on retry. Existing audio files and cue data are not rewritten.

## Host boundary

The adapter uses `database_drives`, `playlist_tree`, `library_summary`, `open_view`, `fetch_rows`, `track_details`, `create_playlist`, `import_files`, `playlist_duplicates`, `add_tracks_to_playlist`, `analyse_track`, `view_ids_in_range`, and `reorder_playlist`. It checks library identity for write requests. Inputs are JSON-serialized into fixed CDP evaluation templates, not concatenated as executable user source.

CDP is an implementation detail, not a stable public rbxport extension API. An app update can break command shapes. Keep failures explicit. There is a narrow race between the order comparison and native reorder; avoid simultaneous manual playlist rearrangement during sync. The host has no atomic compare-and-reorder endpoint.

## Extending acquisition

A downloader adapter must return a candidate identity, original codec/bitrate and duration before transcoding. Never accept an output bitrate as proof of source quality. Alternative spotDL/scdl integrations must preserve that distinction, expose rejection reasons, use shell-free argument arrays, and reuse the same full audio validation. The default policy is MP3 320/lossless. Only an explicit saved `club-aac-256` choice also allows AAC >= 256 kbps; it never allows low-bitrate MP3, Opus or upscaling.

## Acquisition in 0.5.0

`Downloads.candidates` is a lazy bounded source iterator: a source SoundCloud URL, SoundCloud search, Newgrounds search and YouTube search. Failed providers and malformed/null search entries are isolated. Each candidate and up to two formats can be tried, with an eight-file provisional-download cap, fixed request/transfer limits and cancellation. The private Node runtime is supplied to yt-dlp for JavaScript extraction. Actual validation is authoritative; no output encoding bitrate proves source quality.

Soulseek retains the pinned helper and DPAPI vault. Remote unknown properties no longer fail discovery. Cleaned primary-artist and title variants plus the helper's broader search passes improve recall while final matching still uses the original recording, mix and duration. Peer filename/folder evidence is used when tags are absent; raw peer/account details never enter UI models. Rejected peers are excluded from subsequent bounded attempts in the same acquisition. Per-track source-attempt records distinguish quality, identity, empty results, provider access and transfer failures. Retry missing clears held automatic acquisition state while retaining explicit manual choices and cancelled jobs.

For API access denials, Spotify may use a public server-rendered snapshot with an exact total count and explicit final pagination marker. Missing state, a wrong playlist ID, partial content or any continuation offset is rejected. No embed previews, hidden API tokens or partial-page pagination guesses are used.

## SoundCloud uploader tags in 0.6.1

Some imported SoundCloud files have the uploader/label in their artist tag while source metadata identifies the performer. The matcher retains these candidates below the usual artist-score threshold when their complete normalized upload titles are identical and contain the source performer credit as whole words. It can mark them confident only within the already linked target playlist, with matching duration and version; the existing unique-candidate selection still rejects ties. Elsewhere they remain for review. This does not relax downloader identity/quality checks or Spotify matching, and it does not rewrite local tags. Cached rechecks replace stale missing/source-review rows with the newly established local matches.

## Metadata and collection reuse in 0.6.2

The metadata runner uses yt-dlp's `--ignore-no-formats-error` together with skip-download/JSON output. This preserves metadata for protected or unplayable recordings; actual acquisition commands never receive that flag. Complete source scans no longer use blanket `--ignore-errors`: failed extraction, missing/null entries, missing IDs and declared-count mismatches reject the snapshot. Discovery still skips individual failed sources, and protected candidates/format records are excluded from downloads while alternative sources remain available. No DRM decryption is attempted.

Uploader-tag matching now applies to the entire current collection, including files already used in other playlists. Exact credited upload titles, duration/version checks and unique-candidate selection remain required; a unique matching target member is still preferred when the collection contains copies. Bracketed feature credits are removed from the recording-title comparison, and explicitly multi-artist source credits can match slash-separated local credits containing all those performers. This does not split a lone artist name such as AC/DC into independent artists or merge differently named mixes.

## Bulk existing matches in 0.6.0

The bulk planner rescans the collection and target, then selects only identifiable, unambiguous local files for existing-match reviews. It prefers a unique eligible target file and otherwise requires one eligible candidate. Alternate lengths/versions require an explicit flag. Source and local titles, artists and durations are visible in the preview; file paths stay out of the plan. The signature covers the saved source snapshot, options, proposed decisions, known source IDs and target membership/order. Acceptance repeats the scan, checks the signature, current library and each selected file, then adds any missing memberships for existing collection files and applies saved source order with extras preserved at the bottom. Reordering uses the host's guarded expectedIds check and saves an order backup. Duplicate memberships block the operation before any write. Only after host success are all selected bindings/row decisions committed in one SQLite transaction. It takes the engine operation lock and invokes no download/import/analysis capabilities. Host writes and SQLite cannot form one transaction: if host writing fails, decisions remain unaccepted and a fresh preview can retry; any already added memberships are preserved and reused.
