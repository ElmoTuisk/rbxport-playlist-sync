# Validation record

Updated 20 October 2026. This record distinguishes tests from unverified integrations.

## Launcher/sidebar detection 0.10.2

All 130 tests passed on Windows with real FFmpeg/ffprobe and DPAPI enabled; none skipped. Isolated PowerShell fixtures cover excluding Store 0.19.3, selecting an eligible registered package, explicit executable precedence, invalid explicit paths, delayed button readiness, permanently missing buttons, bounded retries and immediate incompatible-build failure. Renderer checks distinguish script installation from a visible attached button, including subsequent detachment. Bridge checks reject missing library identity commands before any library operation.

Earlier inspection found the add-on service stopped and Store rbxport 0.19.3 running without its automation port. A normal relaunch enabled the port but confirmed that build lacks `database_drives`, so the add-on could not safely identify the current library. The installed standalone 1.9.0 has that API. No live library access, app restart or desktop control was used in this code-only verification round. The changed launcher and sidebar attachment still require a user-initiated launch for live confirmation; this record does not claim the currently running window was repaired.

## Quality status precedence 0.10.1

The reported example's web searches found lower-quality AAC/Opus alternatives, then Soulseek supplied a different MP3. Independent ffprobe checks confirmed 320 kbps for both the received source and published file, both 222.18449 seconds. Their compressed audio packet hashes matched, so the add-on did not upscale/re-encode this example. This establishes encoding and packet preservation, not the history of the original recording.

All 130 tests passed on Windows with real FFmpeg/ffprobe and DPAPI enabled; none skipped. Renderer regressions cover an active search, an unverified transfer, verified preparation/import/analysis, a completed 320 kbps file, import retry, retained alternatives and explicitly approved lower-quality audio. Both issue rows and All tracks use current transfer/verified-file state ahead of older alternatives. The quality and acquisition policy is unchanged.

## Artwork and broader discovery 0.10.0

All 129 tests passed on Windows with real FFmpeg/ffprobe and DPAPI enabled; none skipped. New regressions cover Spotify API/public-page and SoundCloud cover metadata, exact-track oEmbed fallback (including Spotify's image-cdn host), image host/redirect validation, size limits, caching, cancellation and existing attached-picture fallback. Real MP3/M4A/approved FLAC files contain a front-cover JPEG and album tag; audio packet hashes (MP3/AAC) and decoded 24-bit PCM hashes (Opus to FLAC) stay unchanged. Missing provider images preserve usable audio. Discovery fixtures cover a valid sixth result, alternate-query deduplication, Spotify `(with …)` naming and retaining a remixer after inline `ft.` credits while rejecting wrong versions/durations. Temporary Soulseek connection failures no longer abandon later web downloads; a bounded backoff prevents repeated helper launches during the outage. Authentication failures still stop.

The live 39-track EDM playlist was already downloading, not reporting completed failures. The first nine completed jobs passed actual audio checks; a stalled peer was retried successfully. A new Howling remix file was imported as verified 320 kbps MP3 with an attached cover. Exact-track provider artwork was fetched and decoded separately against Spotify's live oEmbed/CDN response. A fresh authenticated metadata read exposed all 39 tracks and covers. Public-page access varied (one complete snapshot, a later partial page); incomplete data was rejected safely. These observations do not establish that all 39 can be acquired or that any file's encoding proves its original recording provenance.

Discovery audits covered five linked playlists: 39-track EDM, 46-track UKG, 46-track remix/bassline, 27-track soulful house and a 900-track house archive. The two 46-track SoundCloud sets were read fresh; all entries had artwork, and the remix set retained its two preview-only/two unplayable entries. Existing 27/900-track collection snapshots were used for those two sample searches; their ready counts are reuse/history, not new downloads. Representative recordings were found on the web but only lower-quality formats were exposed to the tested session. The EDM `(with …)` sample yielded six identity matches after the naming fix. Newgrounds searches were blocked in this session and other providers continued. The supplied game-music Spotify URL was unavailable to the tested account/public fallback; its acquisition could not be evaluated. These were discovery samples, not complete download runs or a demonstrated 95% rate. See [playlist-testing.md](playlist-testing.md) for the scorecard and remaining full-run criteria.

## Automated checks

Version 0.3.2 adds ten Spotify-authentication checks: restart recovery, S256 challenge/verifier correspondence, invalid and expired states, incomplete callbacks, cancellation, duplicate/repeated success callbacks, provider Client ID errors, malformed token responses and friendly callback pages. A Windows test uses actual DPAPI-protected files with fresh vault instances to verify restart recovery and encrypted pending state. Token exchange is faked in these tests; they do not claim a successful live Spotify account authorization.

The repaired running service was also checked: visiting the bare callback address returned HTTP 200 with the explanatory HTML page, and the native Settings panel exposed the Client ID field and Connect action within the app viewport. The current account remained disconnected; a fresh user-initiated authorization is still required.

120 Node tests passed on Windows with Node 24.19.0 and FFmpeg/FFprobe 9.0.2. No automated tests access an installed music library.

- Source order, stable extras, repeat-sync idempotence and source removals.
- Duplicate collection matching, duplicate target protection and missing files.
- Mix/version distinctions, candidate identity and duration checks.
- Strict source bitrate/codec policy and independent stream metadata.
- Real synthetic 128 kbps MP3 rejection, 320 kbps MP3 acceptance, lossless conversion and published-file preservation.
- Truncated MP3 rejection using decoded duration even when its header claims full length.
- Partial source failures preserve snapshots; interrupted analysis resumes without redownloading.
- Spotify pagination and concurrent snapshot changes using a fake API.
- Local API pairing, Host/Origin restrictions, static-file allowlist and read-only demo mode.
- Native bridge expressions and guarded reorder execution with a fake Tauri host.
- Private installed-tool defaults, compact-window launch arguments, paths with spaces, pairing validation and persistent installed-data paths.
- Main-frame/origin isolation for native UI actions, self-contained script compilation and idempotent shutdown.

## Bulk quality approval and deleted targets 0.9.0

Nine additional regressions cover the preview/confirmation boundary, best known exact choices, atomic rejection of stale offers and wrong libraries, active-operation guards, exclusion of uncertain choices, serial acquisition/import, continuation after a failed transfer, cancellation with queued approvals, one final source-order pass, and no downloads for unrelated rows. Deletion fixtures cover current-library-only reconciliation, incomplete snapshots, playlist-specific history cleanup, retained audio/bindings, shared-job reassignment, and cancellation before removing an active target without resurrecting records. Renderer tests verify one batch confirmation and cancellation/selection dismissal. All 120 tests passed on Windows with no skips.

The native version 16 panel exposed a 42-song preview for the existing live playlist, choosing reported AAC 160 or 96 kbps. Accept 42 & download was enabled and visible above the sticky footer inside the app viewport. The real confirmation was not clicked: no approvals or downloads were created by the verification. Serial acquisition/import and deletion behavior were tested with isolated fixture libraries; no real user playlist was deleted for testing.

## SoundCloud downloads and performance 0.8.0

The failing 46-track source was inspected without acquiring audio or changing playlist membership. Its saved run was a library-only preview, not a download batch. The public formats offered 42 full-length lower-quality streams, two preview-only entries, and two entries with no playable formats. No original download format was exposed to the current session. The new complete read returned all 46 and corrected the two preview lengths to 185.182 and 143.695 seconds using matching public SoundCloud IDs/full_duration. Three bounded public page requests supplemented one extractor run. Looking up the first original again used the cache and started no extra metadata process. This establishes discovery/length handling, not 46 successful downloads.

Official SoundCloud download formats are preferred over streams. The Accept artist-enabled official downloads at their original quality setting is enabled by default; it permits original bitrate while retaining recording, full-decoding, duration, stereo and sample-rate checks. A real synthetic 128 kbps MP3 official-original fixture passed acquisition/publishing and its compressed packet hash was unchanged. Ordinary lower-quality streams still need confirmation. Original availability can require SoundCloud sign-in/cookies; external artist download gates are opened on the SoundCloud page for user completion, never submitted automatically. No authenticated live official-original transfer was available to verify for this source.

Performance changes reuse prepared SQLite statements and installed native renderer code, coalesce cosmetic transfer progress, avoid redundant add commands for known target members, bound original metadata/public-hint caches, ignore unrelated app mutations and skip hidden/unchanged panel renders. Collapsed All tracks does not construct the 900 ready rows in the regression fixture. Tests verify code reuse/reinstall, hidden render counts, mutation filtering, cache limits/expiry/cancellation and progress coalescing. The running native UI (version 15) displayed 42 original-stream quality choices and two corrected preview lengths; View quality opened its format choices, and the complete popover stayed within the viewport. Independent before/after target-ID checks confirmed unchanged membership. A 25-second hidden-panel sample spanning a heartbeat observed zero root DOM mutations. Job lookup now uses a row index instead of repeatedly scanning the job list. These are targeted checks, not a guarantee about every machine or a benchmark of audio playback under load.

## Visible quality status 0.7.1

Two new renderer regressions cover a lower-only result with codec/bitrate before opening its form, Review quality versus ordinary Resolve, the All tracks status, ongoing searches, saved approvals, verified unknown-bitrate files and already imported lower-quality audio. All 97 tests passed on Windows with no skips. The acquisition and confirmation rules are unchanged.

## Per-song lower-quality choices 0.7.0

Ten additional regression tests cover discovery offers without acquisition, exact-format approval with no replacement fallback, per-song URL and local-file confirmation, normal-quality source selection, retained URLs/errors, targeted downloads leaving other rows alone, and the renderer's separate confirmation/draft persistence. Real FFmpeg tests compare copied MP3/AAC packet hashes and decoded 24-bit PCM hashes for Opus-to-FLAC playback output. Lower-than-approved or unexpectedly unknown bitrate holds the verified file for fresh confirmation. Existing strict audio and full-decoding tests remain enabled.

The running native panel (injection version 13) was checked with a real source offering reported AAC at 160 and 96 kbps. Source selection waited for confirmation, the URL remained visible, the confirmation stayed inside the app viewport and its final button was reachable. No real quality exception was approved and no lower-quality audio was downloaded or imported. Independent target-ID checks confirmed unchanged playlist entries/order and unchanged global audio settings. Live approval/import of this particular source is still for the user; synthetic tests establish the publishing and targeted import behavior separately.

## SoundCloud metadata and collection reuse 0.6.2

Regression coverage verifies that no-format tolerance is scoped to metadata commands, complete scans do not ignore extraction errors, DRM sources/format records are never downloaded, discovery continues to a verified alternative, and missing entries/IDs/durations/count mismatches reject a source snapshot. Matching tests cover unique uploader-tag files outside the target, duplicate copies and featured-credit normalization without changing mix or AC/DC identity safeguards. An engine fixture reuses a collection file outside the target without acquiring or importing it.

The live failing playlist contained 25 source tracks; three protected SoundCloud entries caused the old complete scan to exit with status 1. The metadata-only revision returned all 25 with IDs, titles and durations, including those protected entries. A plain flat-playlist read was also examined and rejected as a solution because it returned track stubs without complete titles/durations. A read-only comparison against the current collection identified 20 existing recordings; several were members of another local playlist. No protected audio was downloaded during this metadata check.

## SoundCloud uploader matching 0.6.1

Four regression tests cover uploader/performer artist-tag differences with exact credited upload titles, catalog prefixes and sentence-style titles; target-only automatic matching; Spotify and generic-title exclusions; version/duration, duplicate and missing-file checks; and a cached recheck clearing a stale source review followed by sync reusing the existing file without acquisition/import/analysis.

A live linked SoundCloud playlist previously showed four unresolved source items even though their exact upload titles were already present in its target. The local artist tags named uploader/label accounts, while source metadata named performers. All four files were present and their durations differed by less than one second. After applying the fix, a cached Recheck files recognized all 46 source songs with zero needing attention. Independent before/after target-ID checks confirmed that all 56 existing entries and their order stayed unchanged; no downloads or playlist writes were performed. The native panel displayed the corrected count and no-attention message. Private track metadata, account data and screenshots are excluded from this package.

## Bulk existing matches 0.6.0

Nine regression tests cover the real renderer's separate confirmation, explicit alternate-version selection, preferred target matches and tied candidates, stale-plan rejection, a file disappearing during revalidation, active-sync locking and wrong-library rejection. They also verify immediate source ordering, existing collection memberships, already confirmed tracks, stable extras, duplicate membership rejection and retry after a failed host reorder. No download, import or analysis calls occur. Failed revalidation or host reorder saves no partial match decisions.

The live native panel (injection version 12) was verified with a long existing-match review list: the standard preview and explicit alternate-version preview loaded, the panel stayed inside the app viewport, and Accept & reorder remained reachable. The checkbox was restored to its default off state and the preview was left open without confirming any real matches. Real bulk ordering was not applied during this UI check; host ordering behavior is covered by the fixture tests above.

## Downloader revision 0.5.0

The regression suite covers cross-provider failover, a failed first file followed by a valid second file, provisional metadata, cancellation, complete-vs-partial public Spotify pages, original/featured title variants, alternate and stalled Soulseek peers, saved audio policies and escaped source-attempt details. Real FFmpeg tests reject low AAC and 256 kbps MP3; an allowed AAC source is copied to M4A with exactly matching compressed audio packet hashes.

The real pinned Sockseek helper also acquired synthetic 320 kbps MP3 with remote tag/quality metadata intentionally omitted, followed by actual source/output verification. This exercises the missing-peer-metadata case independently of stubbed process tests.

A live Geometry Dash example was acquired from Soulseek: a 256 kbps MP3 candidate was rejected, then a lossless FLAC candidate passed identity, duration, stereo/sample-rate and full decoding checks. Its published test output was verified as 320 kbps MP3 at 44.1 kHz stereo, 191.47 seconds. The test used a private staging folder and did not import or change playlist entries. This establishes one successful peer transfer, not full-playlist coverage. The updated native panel was checked in the running app: version 10, masked account field, bounded viewport and reachable Save button.

Live web searches found the two examined Geometry Dash recordings on SoundCloud/YouTube but offered audio below the selected club thresholds; Newgrounds returned HTTP 403. A complete four-track public Spotify snapshot was read and validated earlier; later public requests were unavailable, so acquisition tests used that saved complete snapshot. Public-page layouts and access can change. These failures remain explicit and are not bypassed or described as a song being absent from the web.

The records below document earlier versions and their integration limits at the time.

## Soulseek sign-in fix

Version 0.4.1 fixes fractional track durations producing a decimal `--length-tol` argument, which Sockseek rejects before sign-in. The search tolerance is now rounded up to whole seconds; the original exact duration tolerance remains enforced on actual audio. Helper option errors are classified as setup failures rather than account failures. A live search-only check using the saved account confirmed successful sign-in; the searched recording had no results. This check downloaded no music and made no playlist changes. Regression tests cover fractional durations and rejected helper options.

## Minimal native panel

Version 0.4.0 adds cached local-file rechecks and an optional Soulseek batch queue. The real pinned Sockseek 3.0.6 Windows executable was tested offline using its mock-file mode and a generated stereo, 44.1 kHz, 320 kbps MP3. The actual helper selected the fixture file; the add-on checked identity, fully decoded the source and verified the published 320 kbps MP3. A second real-helper test confirmed that its nonzero no-result exit becomes a per-track review rather than stopping the batch. No Soulseek account or peer-network transfer was used. Unit tests cover CSV quoting, required quality flags, public credential status, temporary config cleanup, rejected identity/audio, cancellation, held failures, explicit retries and batch-stopping account errors. A live cached collection recheck confirmed that equivalent artist separators now reuse existing files without downloading or modifying the host playlist. Live Soulseek login/download behavior awaits user account verification.

Version 0.3.3 opens Resolve immediately below the selected missing song, scrolls the form into view and focuses its action selector. Live read-only UI checks passed on the first, middle and last unresolved rows in playlists with four and 85 unresolved tracks. Each form was adjacent to its own row, fully visible and within the app viewport. No resolution was saved and no music or playlist entries were changed by those checks. Switching playlists with a focused resolution field now forces the newly selected details to render. Two automated renderer/controller regression tests cover inline form placement in an 85-row fixture and focused-field playlist selection.

Version 0.3.1 fixes the popover keeping its initial position after content expansion. ResizeObserver now measures content changes and the geometry clamps the complete panel to the visible viewport. Live checks passed with expanded Advanced settings at a normal 1536 × 870 CSS-pixel viewport and a short 900 × 420 viewport. In the short view the panel stayed between y=12 and y=408, scrolled internally, and the settings Save button was reachable above the footer. The original viewport was restored after testing. Three automated regression tests cover content growth near the bottom, oversized panels and narrow/offset viewports.

Version 0.3.0 was attached to the running Windows rbxport app. Its entry appeared directly below Tag List on the left. The popover measured 390 pixels wide and showed one linked playlist, a single Sync action, its current status and a link action. No dashboard or navigation tabs remain. A muted amber symbol appeared beside the real linked playlist while four tracks needed attention. Clicking that symbol successfully traversed the main-frame request/reply binding, opened four unresolved rows and showed the retained-extras notice. Closing and reopening the ordinary panel collapsed those details again. Read-only host rows were exercised; their missing drop-target ID is handled by exact unique-name matching. The annotation is display-only and preserves native playlist names. The production Desktop and Start Menu shortcuts were also created for the user's current source installation with a verified private Node runtime.

## Desktop setup

Version 0.2.0 was installed and updated in an isolated Windows workspace folder with private Node 24.19.0, yt-dlp 2026.08.19 and FFmpeg/FFprobe 9.0.2. Cached distribution files passed the same SHA-256 checks used for downloads. The installed copy ran with automatically configured tool paths and a default Music folder; all three tool health checks passed. The fixture used fictional demo data and did not copy real playlist state.

Desktop, Start Menu and Stop shortcuts were created under an isolated shortcut root and inspected for existing targets, quoted script paths and hidden-console launch arguments. The production launcher opened an Edge app window with the Playlist Sync title using the existing user's settings; the compact UI layout was visually checked. A genuinely clean-machine internet installation still needs release testing. Local setup reused verified cached downloads and suppressed automatic launch for the fixture.

## Live integration

The Windows rbxport 1.9.0 automation connection, library identity, playlist enumeration and full collection scan were verified against an explicitly selected local playlist. The SoundCloud source contained 46 tracks; the updated read-only preview confidently matched 42 and found 4 missing. Playlist details, account data and local paths are excluded from this distributable document.

The live sync completed: 42 source tracks were placed first in source order, followed by 14 extra local entries in their original relative order. One existing collection track was added to the target, taking it from 55 to 56 entries. All original entries were retained. Four missing tracks remained in review because no acceptable source was available; no new audio was downloaded. Independent before/after checks verified both the source prefix and extras ordering. Hourly automatic sync was enabled for this explicitly requested link.

The first write run exposed a JavaScript declaration collision in the reorder adapter. It failed before reordering; the adapter was fixed, a regression test was added, and the subsequent run succeeded. A real-audio test also exposed truncated files whose headers claim a full duration; decoded duration is now checked independently.

Live Spotify authentication is not verified because no Spotify Client ID/account was supplied. Successful fixture tests do not establish that an account is allowed by Spotify's developer policy. The public source package excludes the real playlist state and reports.

## Release confidence

This is an experimental first release, not a general compatibility guarantee. Test the pinned rbxport command shapes after any host update. Network/provider changes can affect source metadata and downloader behavior. Tool checksums were verified for the local test installation; tool binaries are not included in the source package.
