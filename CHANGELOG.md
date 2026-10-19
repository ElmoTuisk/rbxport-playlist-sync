# Changelog

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
