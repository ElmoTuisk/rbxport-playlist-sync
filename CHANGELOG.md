# Changelog

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
