# Architecture and maintenance notes

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
5. Reject unsuitable identities, lengths and source formats before downloading. Verify downloaded source, convert lossless to MP3 320 or copy MP3 audio packets, then verify final audio. Never overwrite a previously published file.
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

A downloader adapter must return a candidate identity, original codec/bitrate and duration before transcoding. Never accept an output bitrate as proof of source quality. Alternative spotDL/scdl integrations must preserve that distinction, expose rejection reasons, use shell-free argument arrays, and reuse the same full audio validation. A future optional quality mode must not silently weaken the current fixed policy.
