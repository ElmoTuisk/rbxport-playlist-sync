# Changelog

## 0.11.2 — 2026-10-23

Download **playlist-sync-0.11.2-windows-setup.exe** to update your existing copy. Close rbxport first; setup handles an idle older Sync service. Source and checksums remain public.

- Start Playlist Sync from the standard rbxport Start Menu/Desktop shortcuts and stop it when that rbxport process exits. Cancel in-progress work, retain saved state, and tolerate sidebar reloads and quick host restarts. Remove the separate Stop shortcut and older Sync login entry; preserve Playlist Wizard registration. Restore unchanged original shortcuts when integration is disabled or uninstalled.
- Fix the installer remaining open after successful setup because a background service inherited its output pipes. Follow the setup process directly, display concise errors, and make Cancel, Escape and window close request safe cancellation. Finish any file-install phase already in progress before closing.
- Update the selected copy in place after safely shutting down its idle disconnected service. Refuse active work and unrelated processes; retain music, settings and the existing data location. Direct executable launches, custom shortcuts and the older unsupported Store entry do not use the standard shortcut integration.

## 0.11.1 — 2026-10-23

Download **playlist-sync-0.11.1-windows-setup.exe** to install or update. Stop Playlist Sync first. Source code and SHA-256 checksums remain available alongside every release; the EXE is unsigned.

- Add a single Windows setup executable with an embedded, checksum-checked source payload, automatic extraction and verified dependency installation. Offer automatic attachment to regular rbxport launches in the setup window; retain the source ZIP for development.
- Add managed installation receipts, Windows Installed apps registration and a confirmed **Uninstall Playlist Sync** action in the existing popup settings. Refuse uninstall during sync, shut down only the add-on, preserve companion startup registrations, and remove only unchanged owned program files. Music, library entries, saved settings and unrecognized/edited files are retained.
- Find existing installations using saved registration, shortcuts and the standard install folder. Update the same folder and preserve the saved-data path, including older setup receipts and portable `.local-data`. Offer a folder picker for unregistered portable copies; refuse ambiguous copies, unrelated folders, data-path changes, source checkouts and downgrades. Building the executable does not install it.

- Add optional automatic attachment for regular rbxport launches: independent hidden services at Windows sign-in, a per-user local connection setting, companion-aware disable/restore and a background launcher that never opens the host. Verify both sidebar buttons return after a normal Explorer launch of rbxport 1.9.0. A full Windows sign-in remains untested.

- Add a cooperative main-window write lease so this source build and the independent Playlist Wizard add-on do not overlap native mutations. Keep it held until the native promise settles. Library identity and existing Sync ordering/audio checks remain enforced. Playlist Wizard has its own source project, documentation and test suite; it is not part of the Sync setup ZIP.

- Add an opt-in Spotisaver connection for Spotify tracks, selectable first or as a last resort after web discovery and enabled Soulseek. Preserve earlier source attempts, explicit choices, cancellation and Soulseek account/setup stops. Hold exhausted last-resort jobs until a retry. Use an isolated anonymous session and the same-origin transfer relay, with bounded requests, cancellation, rate-limit backoff and fallback on unavailable/changed service responses.
- Require matching metadata, file tags and duration, complete decoding, stereo, sample rate and actual MP3 audio at exactly 320 kbps. Copy its compressed audio unchanged; retain `original quality unverified` in file tags, saved reports and the compact UI. Do not infer upstream quality from the output bitrate.
- Add Verify Spotisaver in Advanced and Spotify song reviews. Open a separate Edge/Chrome profile, let the user complete any site verification, retain cookies inside that browser, and stream subsequent requests/audio through the same session. Keep the compact status, explicit retry, library/source-choice guards, bounded transfers and normal audio validation. No extension or cookie export is needed.
- Keep Spotisaver disabled by default. Direct HTTP requests were challenged; the dedicated browser subsequently downloaded all three selected live test recordings as verified 320 kbps MP3 into isolated folders. No manual challenge was presented in the successful runs. This small sample does not establish an overall reliability rate or original recording quality.

## 0.10.5 — 2026-10-20

- Stream fully extracted candidate metadata as it arrives instead of waiting for every search result. Overlap the primary SoundCloud/YouTube metadata searches while preserving original-download priority, provider order, result limits, lazy alternate names and all recording/audio checks.
- Bound background discovery to two providers, cancel unused work and retry failed prefetches at their normal turn. Source playlist snapshots still require complete metadata; unexpanded/malformed search streams fall back to the previous bulk extraction.
- Avoid retaining duplicate streamed stdout, preserve UTF-8 across output chunks, handle final lines without a newline and propagate parser errors safely. Keep remix labels in single-artist primary searches.

- Shorten the GitHub README to a quick start, screenshots and feature overview, with eight expandable help topics. Keep the longer instructions in `docs/usage.md`.

## 0.10.4 — 2026-10-20

- Clear stale playlist failures caused by the old host's missing `database_drives` command after a successful connection to the same library and existing target. Show a neutral refresh prompt instead of leaving the old failure under the playlist.
- Preserve historical failures, unrelated provider/audio errors, other libraries and saved song decisions. Reconnecting does not mark songs downloaded or certify their current files.
- Remove injected-script stack frames from new host diagnostics while retaining their useful error message.

## 0.10.3 — 2026-10-20

- Attach the sidebar independently of library validation. Unsupported library APIs now show a diagnostic in the popup instead of preventing the button from appearing.
- Keep saved links/bindings intact on connection failures, block library actions while unavailable, remove stale host badges and recover controls after a successful reconnect. Every host library command retains its identity guard.
- Coalesce startup connection requests and retain a concurrent popup-open request. Distinguish visible UI readiness from library readiness in launcher results.
- Add `--pause-automatic` for connection-only diagnostic sessions without changing saved automatic-sync preferences.

## 0.10.2 — 2026-10-20

- Require a visible, attached sidebar button before the launcher reports success. Retry while the window loads; show a clear failure if the sidebar cannot attach.
- Detect eligible registered Store installations dynamically while excluding older builds such as 0.19.3 that lack the required library API. Preserve explicit executable selection, fail on an invalid explicit path, and retain standalone discovery.
- Explain unsupported library commands instead of failing silently. Library identity checks still run before every library operation; no compatibility shortcut bypasses them.
- Publish tagged setup packages and checksums through GitHub Actions only after both Windows and Linux tests pass.

## 0.10.1 — 2026-10-20

- Stop showing an orange quality-choice warning from earlier web alternatives while a normal source/Soulseek fallback is searching, downloading or importing. Show current progress and keep transfer quality pending until the actual file passes verification.
- Show verified codec/bitrate while preparing/importing a checked source and beside completed normal-quality downloads under All tracks. A verified file awaiting import retry also takes precedence over old web offers.
- Keep lower-quality alternatives for later review and retain explicit lower-quality approval/ready-file warnings. Use neutral "alternatives available" wording instead of claiming that only lower-quality audio exists.

## 0.10.0 — 2026-10-20

- Embed exact Spotify album/SoundCloud track artwork automatically in new downloads, preserve existing attached covers as fallback, retain album tags and keep missing artwork from blocking verified audio. Bound image requests/cache and normalize JPEG cover attachments for MP3, M4A and approved FLAC playback output.
- Resolve covers for saved Spotify snapshots through exact-track oEmbed lookup. Preserve MP3/AAC compressed packets and approved Opus playback PCM; do not rewrite existing collection files.
- Fix bracketed `(with …)`/`ft.` credits rejecting the same recording. Check ten initial web results, keep version names in the first query and lazily try distinct alternate names while deduplicating results and preserving recording/quality checks.
- Preserve remix annotations after inline featured credits so a different remixer is not accepted accidentally. Continue later songs after a temporary Soulseek connection failure, with a one-minute peer-search backoff; authentication/setup errors still stop the batch.
- Document the playlist test matrix and completion metrics, distinguishing new acquisition, existing-file reuse, pending work and quality holds.

## 0.9.0 — 2026-10-20

- Add playlist-level Accept lower quality… with a reviewed song/codec/bitrate preview and one Accept N & download action. Choose the highest reported bitrate from current eligible options, pin per-song source/format approvals, and keep global standards unchanged.
- Process accepted songs sequentially, continue after individual failures, preserve queued approvals on cancellation and apply source order once with stable extras. Reject stale previews and exclude uncertain/cancelled/existing-match choices.
- Remove deleted rbxport targets from the add-on after a successful current-library check. Cancel active work before cleanup, retain shared jobs for other links, and preserve audio and reusable collection bindings.
- Document separate rbxport/add-on updates and compatibility limits.

## 0.8.0 — 2026-10-20

- Distinguish library-only checks from download attempts and expose original-stream quality choices immediately after reading a SoundCloud playlist.
- Correct preview-only SoundCloud durations using public full-length metadata; exclude preview formats from acquisition, including lower-quality approvals.
- Try artist-enabled SoundCloud original downloads first. Accept their actual original bitrate by default, label lower-quality originals, and retain strict checks for ordinary streams. Expose sign-in/external-download requirements.
- Cache bounded original metadata, reuse native renderer code/SQLite statements, coalesce progress writes, skip redundant membership writes and hidden/unchanged UI renders, and lazily render All tracks.
- Add README screenshots using example data.

## 0.7.1 — 2026-10-19

- Mark songs with found lower-quality audio directly in the track list and All tracks, including codec, bitrate and whether quality is reported or verified.
- Use Review quality for unapproved offers; distinguish an ongoing source search from a completed lower-only result and an approved download. Keep the separate per-song confirmation.

## 0.7.0 — 2026-10-19

- Offer found lower-quality audio with a separate per-song Confirm & download step showing codec, bitrate and source. The global audio standard is unchanged.
- Inspect selected source URLs/local files before acquisition; retain URLs, form drafts and useful messages after errors, refreshes and quality holds.
- Pin approved source formats, recheck actual audio and require another confirmation if quality drops. Keep duration, decoding, stereo/sample-rate and protected-source checks.
- Preserve lower-bitrate MP3/AAC packets. Decode approved Opus/Vorbis to FLAC for rbxport playback without further lossy compression, and label the original source quality in filenames, tags and the panel.
- Download/import the selected song without retrying other missing tracks, then apply source order while preserving extra entries.

## 0.6.2 — 2026-10-19

- Read SoundCloud metadata even when individual tracks have no playable formats, so DRM-protected entries no longer abort the entire source playlist. The metadata-only option never reaches download commands.
- Reject DRM-protected candidate formats and continue source failover; retain complete-snapshot checks and validate playlist counts/track IDs.
- Reuse unique SoundCloud uploader-tag matches anywhere in the collection, including files used by other playlists. Normalize bracketed featured credits and equivalent multi-artist lists while retaining mix, duration, duplicate and missing-file checks.

## 0.6.1 — 2026-10-19

- Recognize SoundCloud uploads already in the linked playlist when imported artist tags name the uploader/label instead of the performer. Require an exact normalized full upload title containing the performer credit, matching duration and version, and one unambiguous target match.
- Keep candidates outside the target for review and retain missing-file, duplicate, mix and duration protections. Recheck files clears old missing/source reviews when the recording is already present.

## 0.6.0 — 2026-10-19

- Add Accept suggested matches with a count, collapsible preview and one confirmation for existing local-file reviews.
- Make different lengths/versions an explicit optional choice; keep tied candidates and unavailable files for individual review.
- Accept and immediately reorder known source songs to Spotify/SoundCloud order, preserving extra local entries at the bottom. No separate download sync is needed.
- Revalidate library, candidates, files and playlist membership before applying guarded host writes and saving decisions. No downloads, imports or deletions occur during bulk acceptance; duplicate target memberships block it.

## 0.5.0 — 2026-10-19

- Search SoundCloud originals/search, Newgrounds and YouTube before the optional Soulseek fallback; continue after provider, candidate or format failures.
- Inspect potential MP3/AAC files with incomplete remote metadata instead of discarding them before verification. Actual quality, identity and duration checks remain mandatory.
- Add cleaned multi-artist queries, broader Soulseek search passes and alternative peers after a rejected file.
- Replace the Soulseek-only batch action with Retry missing and expose source-attempt reasons inside Resolve.
- Add an explicit AAC >= 256 kbps option with packet-preserving M4A output; strict MP3/lossless remains the default.
- Read a public Spotify snapshot only when the page proves its track list is complete; reject truncated previews.
- Make optional incoming peer connections explicit; no automatic firewall/router changes or music sharing.

## 0.4.1 — 2026-10-19

- Fix fractional source durations causing Soulseek to reject its integer-only length tolerance before signing in.
- Report rejected helper options as setup errors instead of misleading connection/password failures.
- Verify a live account sign-in and add regression coverage; audio quality and exact duration checks remain unchanged.

## 0.4.0 — 2026-10-19

- Match equivalent comma/slash artist credits so existing files are not incorrectly marked unresolved.
- Add Recheck files using cached source metadata; distinguish local matching review from source/download review and offer suggested matches in Resolve.
- Add optional Soulseek batch fallback through a pinned, verified Sockseek helper, using the existing compact panel.
- Keep strict identity, duration and audio checks, reuse collection files before searching, retain original playlist entries, and stop a batch on account/connection/setup failure.
- Encrypt saved Soulseek credentials for the Windows account and remove transient helper authentication files.

## 0.3.3 — 2026-10-19

- Open Resolve directly below the selected song instead of after the entire missing-track list.
- Scroll the resolution form into view and focus its action selector, including in long playlists.
- Refresh playlist details when a different playlist symbol is clicked, even if an old form still has keyboard focus.
- Make the README a straightforward GitHub installation page, with detailed add-on documentation and upload instructions in docs.

## 0.3.2 — 2026-10-19

- Preserve pending Spotify PKCE sign-ins securely across service restarts and remember the app Client ID.
- Distinguish direct callback visits, cancelled authorization, expired state and provider setup errors with friendly HTML pages.
- Keep callback validation intact; successful callback refreshes are idempotent and duplicate requests exchange a code only once.
- Show pending/connected Spotify status in the panel and clarify that the redirect address is registered in the developer dashboard, while sign-in starts with Connect.

## 0.3.1 — 2026-10-19

- Reposition the popover when settings, track details or forms grow, keeping its bottom inside the visible app window.
- Limit oversized panels to the available viewport and provide internal scrolling with a visible header and footer.
- Handle window resizing and visual viewport changes; add regression checks for short, narrow and offset viewports.

## 0.3.0 — 2026-10-19

- Replace the dashboard and navigation pages with one small in-rbxport popover.
- Add Playlist sync directly below Tag List on the left; clicking it opens the panel.
- Add subtle, clickable status symbols beside linked playlists, including read-only views with unique names.
- Show current status and a Sync button by default; expand a playlist for missing tracks and Auto-sync. Hide settings behind a gear.
- Use a main-frame-only local runtime binding and scoped styles; leave host CSP and playlist names untouched.
- Make the separate 430 × 500 window an optional fallback. Clean shutdown removes the in-app entry and symbols.

## 0.2.0 — 2026-10-19

- Open in a compact app window with no browser tabs or address bar, using a separate Edge/Chrome profile.
- Add a per-user installer with verified private Node.js, yt-dlp and FFmpeg/FFprobe downloads.
- Create Desktop/Start Menu shortcuts and configure tools and the default Music folder automatically.
- Keep installed user data separate from app files so setup updates preserve it.
- Retain the portable developer launcher and existing playlist synchronization behavior.

## 0.1.0 — 2026-10-19

- Windows companion integration with rbxport 1.9.0, without a host rebuild.
- Spotify PKCE and SoundCloud playlist readers; persistent playlist links and scheduled synchronization.
- Existing-library matching, review decisions, missing-track CSV, download stages and history UI.
- Strict MP3 320 source/output policy with lossless conversion, full decode and duration verification.
- Source playlist order first, local extras retained at the bottom with a notice.
- Durable recovery, duplicate protections, private local state and source-only packaging.

Known limitations and unverified integrations are maintained in README and docs/validation.md.
